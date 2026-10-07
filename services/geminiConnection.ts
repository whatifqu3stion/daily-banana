import type { GenerateContentParameters, GenerateContentResponse, GoogleGenAI } from '@google/genai';

// Personal credentials belong only to the current tab, never browser storage.
let client: GoogleGenAI | null = null;
let key = '';
let revision = 0;
let activeRequests = 0;
let checkingKey = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const subscribeGeminiConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const hasGeminiKey = () => client !== null;
export const isGeminiBusy = () => activeRequests > 0;
export const getConnectionRevision = () => revision;

function safeError(error: unknown, secret: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(secret ? message.split(secret).join('[redacted]') : message);
}

export async function connectGeminiKey(input: string): Promise<void> {
  if (isGeminiBusy()) throw new Error('Wait for the current AI request to finish before changing your key.');
  const candidateKey = input.trim();
  if (!candidateKey) throw new Error('Enter your Google Gemini API key.');
  checkingKey = true;
  activeRequests++;
  notify();
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const candidate = new GoogleGenAI({ apiKey: candidateKey });
    // Metadata lookup validates the credential without generating paid content.
    await candidate.models.get({ model: 'gemini-2.5-flash' });
    client = candidate;
    key = candidateKey;
    revision++;
  } catch (error) {
    throw safeError(error, candidateKey);
  } finally {
    checkingKey = false;
    activeRequests--;
    notify();
  }
}

export function disconnectGeminiKey(): void {
  if (isGeminiBusy()) throw new Error('Wait for the current AI request to finish before removing your key.');
  client = null;
  key = '';
  revision++;
  notify();
}

export async function generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  if (checkingKey) throw new Error('Wait for the Google key check to finish before generating content.');
  if (!client) throw new Error('Connect your Google API key above before using AI. Image generation requires billing-enabled API access.');
  const requestClient = client;
  const requestKey = key;
  activeRequests++;
  notify();
  try {
    return await requestClient.models.generateContent(params);
  } catch (error) {
    throw safeError(error, requestKey);
  } finally {
    activeRequests--;
    notify();
  }
}
