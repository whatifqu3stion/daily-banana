import http from 'node:http';
import { GoogleGenAI } from '@google/genai';
import { createGeminiApi } from '../../server/gemini-api.mjs';

export const ENABLE_LIVE = 'two-paid-images';
export const COST_NOTICE = 'Live Google smoke: two paid 2K image requests (generation + refinement), plus input/text costs. No automatic retries. No live pass is claimed when skipped.';
export function skipReason(env) {
  if (env.GOOGLE_IMAGE_SMOKE !== ENABLE_LIVE) return `SKIPPED: set GOOGLE_IMAGE_SMOKE=${ENABLE_LIVE} to explicitly approve two paid image requests.`;
  if (!env.GOOGLE_IMAGE_SMOKE_API_KEY?.trim()) return 'SKIPPED: creator-supplied GOOGLE_IMAGE_SMOKE_API_KEY is missing from Secrets.';
  return '';
}

export function validImage(data, mime) {
  if (typeof data !== 'string' || !data.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
  const bytes = Buffer.from(data, 'base64');
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return false;
}

// Uses the production handler and real SDK. The only test adapter is the
// browser-to-loopback bridge: the credential never enters the browser.
export async function startLiveSession(key, makeClient = candidate => new GoogleGenAI({ apiKey: candidate })) {
  let calls = 0;
  const checks = [];
  const api = createGeminiApi({
    secureCookies: false,
    createClient: candidate => {
      const client = makeClient(candidate);
      return {
        models: { get: params => client.models.get(params) },
        interactions: {
          create: async params => {
            // A missing-image frontend retry must NOT trigger extra paid calls.
            if (++calls > 2) throw new Error('Live test two-request budget exceeded.');
            const correctFormat = params.model === 'gemini-nano-banana-2.1' &&
              params.store === false && params.stream === false &&
              params.response_format.type === 'image' &&
              params.response_format.delivery === 'inline' &&
              params.response_format.mime_type === 'image/jpeg' &&
              params.response_format.image_size === '2K' &&
              params.response_format.aspect_ratio === '1:1';
            const images = params.input.filter(part => part.type === 'image');
            const correctInput = calls === 1 ? images.length === 0 :
              images.length === 1 && images[0].mime_type === 'image/png' &&
              validImage(images[0].data, 'image/png');
            if (!correctFormat || !correctInput) throw new Error('Live request contract mismatch.');
            // Interactions has its own retry options, independent of httpOptions.
            const result = await client.interactions.create(params, { maxRetries: 0, timeout: 180_000 });
            const image = result.output_image;
            checks.push({
              correctFormat, correctInput,
              completed: result.status === 'completed',
              validBytes: validImage(image?.data, image?.mime_type),
            });
            return result;
          },
        },
      };
    },
  });
  const server = http.createServer((req, res) => void api.handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  let tab = '';
  return {
    checks,
    get calls() { return calls; },
    async forward(endpoint, browserTab, body) {
      tab = browserTab;
      const response = await fetch(`${origin}/api/gemini/${endpoint}`, {
        method: endpoint === 'session' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Gemini-Tab': tab, Cookie: cookie },
        body: endpoint === 'session' ? undefined : JSON.stringify(endpoint === 'connect' ? { key } : body),
        signal: AbortSignal.timeout(190_000),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: response.status, body: await response.text() };
    },
    async close() {
      // No credentials, session cookies, images or upstream exceptions persisted.
      key = '';
      cookie = '';
      api.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
