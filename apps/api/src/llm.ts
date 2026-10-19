import OpenAI from 'openai';

/**
 * Server-side LLM client. Points the OpenAI SDK at a LOCAL Ollama server
 * (OpenAI-compatible API). The browser never imports this — only the API does,
 * so model access stays on the backend.
 *
 * Config via env (see .env.example): OLLAMA_BASE_URL, OLLAMA_MODEL.
 */
const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';

export const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';

export const openai = new OpenAI({
  baseURL,
  // Ollama ignores the key, but the SDK requires a non-empty string.
  apiKey: process.env.OLLAMA_API_KEY ?? 'ollama',
});
