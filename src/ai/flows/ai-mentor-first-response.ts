'use server';

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const MentorFirstResponseInputSchema = z.object({
  userName: z.string(),
});

export type MentorFirstResponseInput = z.infer<
  typeof MentorFirstResponseInputSchema
>;

export async function mentorFirstResponse(
  input: MentorFirstResponseInput,
): Promise<string> {
  return mentorFirstResponseFlow(input);
}

export const mentorFirstResponseFlow = ai.defineFlow(
  {
    name: 'mentorFirstResponseFlow',
    inputSchema: MentorFirstResponseInputSchema,
    outputSchema: z.string(),
  },
  async input => {
    const response = await ai.generate({
      prompt: `
        You are a helpful and friendly AI mentor for a student named ${input.userName}.
        Your goal is to provide an initial greeting and ask some questions to get to know the user.

        Here is your exact task:
        1. Greet the user by their name, ${input.userName}.
        2. Introduce yourself as EmpowerU.
        3. Ask the following three questions. Use a dash (-) for each list item. Do not use any other markdown for list formatting.
            - What is your current academic standing (e.g., last school attended, GPA, recent experience)?
            - What is your personal or family background (e.g., first-gen student, parenting status, etc.)?
            - What are your primary goals for seeking mentorship (e.g., college applications, career advice, etc.)?
      `,
    });

    return response.text ?? '';
  },
);
