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

async function withGeminiClient<T>(request: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  if (checkingKey) throw new Error('Wait for the Google key check to finish before generating content.');
  if (!client) throw new Error('Connect your Google API key in API settings before using AI. Image generation requires paid API access.');
  const requestClient = client;
  const requestKey = key;
  activeRequests++;
  notify();
  try {
    return await request(requestClient);
  } catch (error) {
    throw safeError(error, requestKey);
  } finally {
    activeRequests--;
    notify();
  }
}

export function generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  return withGeminiClient(client => client.models.generateContent(params));
}

export type ImageInteractionInput =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string };

export interface ImageInteractionParameters {
  model: string;
  input: ImageInteractionInput[];
  response_format: {
    type: 'image';
    delivery: 'inline';
    mime_type: 'image/jpeg';
    aspect_ratio: string;
    image_size?: '2K';
  };
}

export function createImageInteraction(params: ImageInteractionParameters) {
  return withGeminiClient(async client => {
    const result = await client.interactions.create({
      ...params,
      stream: false,
      // Continue edits with the actual panel image, not stored server history.
      store: false,
    });
    for (const step of result.steps) {
      if (step.type === 'model_output' && step.error) {
        // Preserve structured Google errors for the existing billing/quota UI.
        const rpcStatuses: Record<number, string> = {
          3: 'INVALID_ARGUMENT', 5: 'NOT_FOUND', 7: 'PERMISSION_DENIED',
          8: 'RESOURCE_EXHAUSTED', 13: 'INTERNAL', 14: 'UNAVAILABLE', 16: 'UNAUTHENTICATED',
        };
        throw new Error(JSON.stringify({
          error: { ...step.error, status: rpcStatuses[step.error.code ?? -1] || 'IMAGE_GENERATION_FAILED' },
        }));
      }
    }
    if (result.status !== 'completed') {
      throw new Error(`Google image interaction ${result.status}. Please try again.`);
    }
    return result;
  });
}
