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
- followUpQuestions should be 1-3 short user-facing topics/questions.
`;

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
        output: {
          schema: MentorChatOutputSchema,
          constrained: true,
        },
        config: {
          temperature: 0.2,
        },
      });

      if (response.output) {
        return {
          answer: response.output.answer,
          followUpQuestions: response.output.followUpQuestions ?? [],
          relatedResources: response.output.relatedResources ?? [],
        };
      }

      return {
        answer:
          response.text?.trim() ||
          "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        followUpQuestions: [],
        relatedResources: [],
      };
    } catch (error) {
      console.error('mentorChat error:', error);

      return {
        answer:
          "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        followUpQuestions: [],
        relatedResources: [],
      };
    }
  }
);