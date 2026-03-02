import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/google-genai';

export default configureGenkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
      apiVersion: 'v1',
    }),
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
