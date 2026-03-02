'use server';

/**
 * @fileOverview Generates a list of colleges based on student interests and academic profile.
 *
 * - generateCollegeList - A function that generates a list of colleges.
 * - GenerateCollegeListInput - The input type for the generateCollegeList function.
 * - GenerateCollegeListOutput - The return type for the generateCollegeList function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateCollegeListInputSchema = z.object({
  location: z
    .string()
    .describe(
      "The student's current location (e.g., city, state, or zip code)."
    ),
  interests: z
    .string()
    .describe('The students interests, separated by commas.'),
  academicProfile: z
    .string()
    .describe('The students academic profile, including GPA and test scores.'),
  collegePreferences: z
    .string()
    .optional()
    .describe(
      'Any other preferences the student has for a college (e.g., trade school, flexible schedule, online options, community college).'
    ),
});
export type GenerateCollegeListInput = z.infer<
  typeof GenerateCollegeListInputSchema
>;

const CollegeSchema = z.object({
  name: z.string().describe('The full name of the college or university.'),
  description: z
    .string()
    .describe(
      'A brief, one-to-two-sentence description of the college and why it is a good fit for the student.'
    ),
  website: z.string().url().describe("The official website URL for the college's homepage."),
});

const GenerateCollegeListOutputSchema = z.object({
  colleges: z
    .array(CollegeSchema)
    .describe('An array of recommended college objects.'),
});
export type GenerateCollegeListOutput = z.infer<
  typeof GenerateCollegeListOutputSchema
>;

export async function generateCollegeList(
  input: GenerateCollegeListInput
): Promise<GenerateCollegeListOutput> {
  return generateCollegeListFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCollegeListPrompt',
  input: {schema: GenerateCollegeListInputSchema},
  output: {schema: GenerateCollegeListOutputSchema},
  prompt: `You are a college counselor. Generate a list of 5-7 colleges based on the student's location, interests, academic profile, and other preferences. Prioritize colleges that are geographically relevant to the student's location unless their interests strongly suggest otherwise. For each college, provide its name, a short description, and its official website URL.

If the student's interests or preferences mention "graduate school" or "graduate programs", you should prioritize linking directly to the university's graduate school or specific graduate program pages instead of the general homepage.

Location: {{{location}}}
Interests: {{{interests}}}
Academic Profile: {{{academicProfile}}}
{{#if collegePreferences}}
Other Preferences: {{{collegePreferences}}}
{{/if}}
`,
});

const generateCollegeListFlow = ai.defineFlow(
  {
    name: 'generateCollegeListFlow',
    inputSchema: GenerateCollegeListInputSchema,
    outputSchema: GenerateCollegeListOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
