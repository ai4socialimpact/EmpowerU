//home/user/studio/src/ai/genkit.ts
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

declare global {
  // Reuse the same Genkit instance across Next.js hot reloads in development.
  // eslint-disable-next-line no-var
  var __empoweru_genkit: ReturnType<typeof genkit> | undefined;
}

function createGenkit() {
  return genkit({
    plugins: [
      googleAI({
        apiKey:
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_GENAI_API_KEY ||
          process.env.GOOGLE_API_KEY,
      }),
    ],
    model: 'googleai/gemini-2.5-flash',
  });
}

export const ai = globalThis.__empoweru_genkit ?? createGenkit();

if (!globalThis.__empoweru_genkit) {
  globalThis.__empoweru_genkit = ai;
}
