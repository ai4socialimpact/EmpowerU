'use server';

import {ai} from '@/ai/genkit';
import {z} from 'zod';
import {resources} from '@/lib/resources';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.array(z.object({text: z.string()})),
});

const MentorChatInputSchema = z.object({
  history: z.array(MessageSchema),
  message: z.string(),
});

export type MentorChatInput = z.infer<typeof MentorChatInputSchema>;

const MentorChatOutputSchema = z.object({
  answer: z.string(),
  followUpQuestions: z.array(z.string()).default([]),
  relatedResources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
      })
    )
    .default([]),
});

export type MentorChatOutput = z.infer<typeof MentorChatOutputSchema>;

const fallbackMentorChatOutput: MentorChatOutput = {
  answer:
    "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
  followUpQuestions: [],
  relatedResources: [],
};

const findResources = ai.defineTool(
  {
    name: 'findResources',
    description: 'Find relevant resources for the user.',
    inputSchema: z.object({
      query: z.string(),
    }),
    outputSchema: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
      })
    ),
  },
  async ({query}) => {
    const search = query.toLowerCase();

    return resources
      .filter(resource =>
        resource.title.toLowerCase().includes(search) ||
        resource.description.toLowerCase().includes(search) ||
        resource.category.toLowerCase().includes(search)
      )
      .map(resource => ({
        title: resource.title,
        url: resource.link,
      }));
  }
);

const prompt = `
You are EmpowerU, a warm and supportive guidance counselor.

You help students and parents with:
- schools
- scholarships
- career goals
- academic programs

Rules:
- Keep answers concise, supportive, and directly relevant.
- Use the findResources tool when helpful.
- Do not invent URLs.
- Any URLs must come only from the tool results.
- Put links only in relatedResources, not in answer.
- Return only a JSON object with this shape:
  {
    "answer": "string",
    "followUpQuestions": ["string"],
    "relatedResources": [{"title": "string", "url": "https://example.com"}]
  }
- followUpQuestions must be 1-3 short clickable messages the student might send next.
- Phrase followUpQuestions from the student's point of view, not the mentor's point of view.
- Good followUpQuestions examples: "Show me scholarships for nursing majors", "I am a high school senior", "Help me compare community colleges near me".
- Bad followUpQuestions examples: "What grade are you in?", "Are you interested in scholarships?", "Would you like more help?"
`;

function extractJsonObject(text?: string): unknown {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return null;
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function normalizeMentorChatOutput(data: unknown, fallbackText?: string): MentorChatOutput {
  const parsed = MentorChatOutputSchema.safeParse(data);

  if (parsed.success) {
    return {
      answer: parsed.data.answer,
      followUpQuestions: parsed.data.followUpQuestions ?? [],
      relatedResources: parsed.data.relatedResources ?? [],
    };
  }

  return {
    answer: fallbackText?.trim() || fallbackMentorChatOutput.answer,
    followUpQuestions: [],
    relatedResources: [],
  };
}

export async function mentorChat(
  input: MentorChatInput
): Promise<MentorChatOutput> {
  return mentorChatFlow(input);
}

export const mentorChatFlow = ai.defineFlow(
  {
    name: 'mentorChatFlow',
    inputSchema: MentorChatInputSchema,
    outputSchema: MentorChatOutputSchema,
  },
  async ({history, message}) => {
    try {
      const recentHistory = history.slice(-10);

      const messages = [
        {role: 'system' as const, content: [{text: prompt}]},
        ...recentHistory,
        {role: 'user' as const, content: [{text: message}]},
      ];

      const response = await ai.generate({
        tools: [findResources],
        messages,
        config: {
          temperature: 0.2,
        },
      });

      if (response.output) {
        return normalizeMentorChatOutput(response.output, response.text);
      }

      return normalizeMentorChatOutput(extractJsonObject(response.text), response.text);
    } catch (error) {
      console.error('mentorChat error:', error);

      return fallbackMentorChatOutput;
    }
  }
);
