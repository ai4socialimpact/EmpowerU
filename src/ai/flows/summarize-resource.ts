'use server';

/**
 * @fileOverview Provides a flow to summarize resources like articles or web pages.
 *
 * - summarizeResource - A function that takes a URL and returns a summary of the resource.
 * - SummarizeResourceInput - The input type for the summarizeResource function (a URL string).
 * - SummarizeResourceOutput - The return type for the summarizeResource function (a summary string).
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeResourceInputSchema = z.object({
  url: z.string().url().describe('The URL of the resource to summarize.'),
});
export type SummarizeResourceInput = z.infer<typeof SummarizeResourceInputSchema>;

const SummarizeResourceOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the resource.'),
});
export type SummarizeResourceOutput = z.infer<typeof SummarizeResourceOutputSchema>;

export async function summarizeResource(input: SummarizeResourceInput): Promise<SummarizeResourceOutput> {
  return summarizeResourceFlow(input);
}

const summarizeResourcePrompt = ai.definePrompt({
  name: 'summarizeResourcePrompt',
  input: {schema: SummarizeResourceInputSchema},
  output: {schema: SummarizeResourceOutputSchema},
  prompt: `You are an AI assistant designed to summarize web pages and articles.

  Please summarize the content found at the following URL:
  {{{url}}}
  `,
});

const summarizeResourceFlow = ai.defineFlow(
  {
    name: 'summarizeResourceFlow',
    inputSchema: SummarizeResourceInputSchema,
    outputSchema: SummarizeResourceOutputSchema,
  },
  async input => {
    const {output} = await summarizeResourcePrompt(input);
    return output!;
  }
);
