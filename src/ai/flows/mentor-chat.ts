'use server';

import {ai} from '@/ai/genkit';
import {MessageData} from 'genkit';
import {z} from 'zod';
import {resources, Resource} from '@/lib/resources';

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
  answer: z
    .string()
    .describe(
      "The main answer to the user's question. This should be a clear and concise response."
    ),
  followUpQuestions: z
    .array(z.string())
    .optional()
    .describe(
      'A list of 1-3 relevant follow-up questions to keep the conversation going.'
    ),
  relatedResources: z
    .array(
      z.object({
        title: z.string().describe('The title of the resource.'),
        url: z.string().url().describe('The URL of the resource.'),
      })
    )
    .optional()
    .describe(
      'A list of 1-2 relevant resources to help the user, found using the findResources tool.'
    ),
});
export type MentorChatOutput = z.infer<typeof MentorChatOutputSchema>;

export async function mentorChat(
  input: MentorChatInput
): Promise<MentorChatOutput> {
  return mentorChatFlow(input);
}

const findResources = ai.defineTool(
  {
    name: 'findResources',
    description: 'Finds relevant resources for the user.',
    inputSchema: z.object({
      query: z.string().describe('The search query to find resources.'),
    }),
    outputSchema: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
      })
    ),
  },
  async input => {
    const search = input.query.toLowerCase();
    return resources
      .filter(
        resource =>
          resource.title.toLowerCase().includes(search) ||
          resource.description.toLowerCase().includes(search) ||
          resource.category.toLowerCase().includes(search)
      )
      .map(resource => ({title: resource.title, url: resource.link}));
  }
);

const prompt = `
  # Role and Purpose
  - Your role is to act as a guidance counselor named EmpowerU who helps students and their parents find and apply for schools and scholarships, explore career goals, and understand academic programs.
  - You are designed to support a broad and diverse audience, with a focus on disadvantaged communities such as single mothers, first-generation college students, and parents returning to education.
  - Keep the tone warm, respectful, and supportive.

  # Tool Usage
  - You have access to a 'findResources' tool that can search for relevant articles, websites, and other resources.
  - You should use this tool whenever the user's question can be answered by providing a link to a resource. For example, if they ask for scholarships, financial aid information, college application guides, etc.
  - Be proactive in using this tool to provide helpful resources.
  
  # URL and Sourcing Rules
  - When citing a source, you MUST ensure the URL is a complete, direct, and currently live link.
  - Do NOT generate or fabricate URLs under any circumstances.
  - You may ONLY use URLs that are returned from the findResources tool. Do not use any other URLs.
  - You must NOT mention the findResources tool by name in your answer.
  
  # Formatting Rules
  - When creating lists inside the "answer" field, use a dash (-) for each item. Do not use any other markdown for list formatting.
  - You must output a JSON object with three keys: 'answer' (your primary response), 'followUpQuestions' (an array of 1-3 suggested follow-up questions), and 'relatedResources' (a list of 1-2 relevant resources found using the findResources tool).
  - When you use the findResources tool, you MUST populate the 'relatedResources' field in the output with the results. Do not include the URLs in the 'answer' field.

  # Critical Output Requirements
  - You must return ONLY valid JSON
  - Do NOT include any text before or after the JSON.
  - Do NOT use markdown formatting.
  - Do NOT explain your answer outside the JSON.
  - The response MUST start with { and end with }.
  - All content must be properly formatted JSON.
`
;

const mentorChatFlow = ai.defineFlow(
  {
    name: 'mentorChatFlow',
    inputSchema: MentorChatInputSchema,
    outputSchema: MentorChatOutputSchema,
  },
  async ({history, message}) => {
    let response;
    try {
      response = await ai.generate({
        tools: [findResources],
        messages: [
          {role: 'system', content: [{text: prompt}]},
          ...history,
          {role: 'user', content: [{text: message}]},
        ],
        output: { schema: MentorChatOutputSchema },
        config: {
          temperature: 0.7,
        },
      });
    } catch (error) {
      console.error('mentorChat generate error:', error);
      return {
        answer:
          "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        followUpQuestions: [],
        relatedResources: [],
      };
    }

    const output = response.output;
    if (!output) {
      return {
        answer:
          "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        followUpQuestions: [],
        relatedResources: [],
      };
    }

    return output;
  }
);
