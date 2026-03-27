'use server';

import {ai} from '@/ai/genkit';
import {z} from 'zod';
import {resources} from '@/lib/resources';

declare global {
  // Reuse flow/tool registrations across hot reloads when ai is singleton.
  // eslint-disable-next-line no-var
  var __empoweru_find_resources_tool: unknown;
  // eslint-disable-next-line no-var
  var __empoweru_mentor_chat_flow: unknown;
}

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

const findResources =
  (globalThis.__empoweru_find_resources_tool as ReturnType<typeof ai.defineTool>) ??
  ai.defineTool(
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

if (!globalThis.__empoweru_find_resources_tool) {
  globalThis.__empoweru_find_resources_tool = findResources;
}

function isSchemaValidationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybe = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    originalMessage?: unknown;
  };
  const hasSchemaMessage =
    (typeof maybe.message === 'string' &&
      maybe.message.includes('Schema validation failed')) ||
    (typeof maybe.originalMessage === 'string' &&
      maybe.originalMessage.includes('Schema validation failed'));

  const isInvalidArgument =
    maybe.status === 'INVALID_ARGUMENT' ||
    maybe.code === 400 ||
    (typeof maybe.message === 'string' && maybe.message.includes('INVALID_ARGUMENT'));

  return isInvalidArgument && hasSchemaMessage;
}

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
  - You must output a JSON object with three keys: 'answer' (your primary response), 'followUpQuestions' (an array of 1-3 suggested follow-up questions the user could ask), and 'relatedResources' (a list of 1-2 relevant resources found using the findResources tool).
  - Follow-up questions should be phrased as topics or questions the USER might want to explore next (e.g., "Scholarships for first-generation students" or "How to apply to community colleges"). Do NOT phrase them as questions you are asking the user.
  - When you use the findResources tool, you MUST populate the 'relatedResources' field in the output with the results. Do not include the URLs in the 'answer' field.

  # Critical Output Requirements
  - Your response MUST ONLY be a valid JSON object. Nothing else.
  - Do NOT include any text, explanations, or commentary before or after the JSON.
  - Do NOT use markdown formatting.
  - The response must start with { and end with } with no additional text.
  - Every response should be pure JSON only.
  - If you use a tool, incorporate the results into the JSON schema and return ONLY the JSON object.
  - Never include any narrative, explanation, or text outside the JSON object.
  - If you cannot provide JSON, still provide JSON with an answer field explaining the issue.
  
  # Example Output Format (Your ONLY output should look exactly like this)
  {"answer":"Your response here","followUpQuestions":["Question 1","Question 2"],"relatedResources":[]}
  - That's it. Nothing before, nothing after. Start with { and end with }.
`;

const mentorChatFlow =
  (globalThis.__empoweru_mentor_chat_flow as ReturnType<typeof ai.defineFlow>) ??
  ai.defineFlow(
    {
      name: 'mentorChatFlow',
      inputSchema: MentorChatInputSchema,
      outputSchema: MentorChatOutputSchema,
    },
    async ({history, message}) => {
    try {
      const baseMessages = [
        {role: 'system' as const, content: [{text: prompt}]},
        ...history,
        {role: 'user' as const, content: [{text: message}]},
      ];

      let response;
      try {
        response = await ai.generate({
          tools: [findResources],
          messages: baseMessages,
          output: {schema: MentorChatOutputSchema},
          config: {
            temperature: 0.3,
          },
        });
      } catch (error) {
        if (!isSchemaValidationError(error)) {
          throw error;
        }

        console.warn(
          'mentorChat: first structured attempt returned null; retrying once with stricter instructions.'
        );

        const retryMessages = [
          {
            role: 'system' as const,
            content: [
              {
                text:
                  `${prompt}\n\nCritical retry instruction: Return only a valid JSON object matching the schema. Do not return null.`,
              },
            ],
          },
          ...history,
          {role: 'user' as const, content: [{text: message}]},
        ];

        response = await ai.generate({
          messages: retryMessages,
          output: {schema: MentorChatOutputSchema},
          config: {
            temperature: 0,
          },
        });
      }

      const output = response.output;
      if (!output) {
        console.error('No valid structured output from model');
        return {
          answer:
            "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
          followUpQuestions: [],
          relatedResources: [],
        };
      }

      return output;
    } catch (error) {
      if (isSchemaValidationError(error)) {
        console.warn('mentorChat: model returned invalid structured output (null).');
      } else {
        console.error('mentorChat generate error:', error);
      }
      return {
        answer:
          "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        followUpQuestions: [],
        relatedResources: [],
      };
    }
    }
  );

if (!globalThis.__empoweru_mentor_chat_flow) {
  globalThis.__empoweru_mentor_chat_flow = mentorChatFlow;
}
