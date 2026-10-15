import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  connectGeminiKey,
  disconnectGeminiKey,
  hasGeminiKey,
  isGeminiBusy,
  subscribeGeminiConnection,
} from '../services/geminiConnection';
import WarningNotice from './WarningNotice';

interface GeminiConnectionProps {
  disabled?: boolean;
  onConnected?: () => void;
}

function readableConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  let failure: { kind?: string; code?: number } = {};
  try { failure = JSON.parse(message)?.error || {}; } catch { /* Local/transport errors are plain text. */ }

  const keyFailures: Record<string, string> = {
    KEY_WEBSITE_RESTRICTED: 'Google blocked this website-restricted key. Use a separate Gemini API key configured for server-side use; keep the Gemini API service restriction.',
    KEY_IP_RESTRICTED: 'Google blocked this server under the key’s IP restrictions. Review the allowed server IPs for this hosting environment.',
    KEY_SERVICE_DISABLED: 'Enable the Gemini (Generative Language) API in your Google project and allow that service in the key’s restrictions.',
    KEY_BILLING_REQUIRED: 'Google requires billing to be enabled for this project or access tier. Review your Google project’s billing settings. No comic was generated.',
    KEY_REGION_UNSUPPORTED: 'Google rejected the key check from the app server’s region. The app needs a supported hosting location; a different key may not fix this.',
    KEY_INVALID: 'That key was not accepted. Check that it is copied correctly and belongs to a Google project with the Gemini API enabled.',
    KEY_QUOTA: 'Google’s key check reached a usage limit. Wait for a rate limit to reset or review your Google project’s quota and billing. No comic was generated.',
    KEY_CHECK_TIMEOUT: 'Google did not finish the key check in time. Try again; this does not mean your key is invalid.',
    KEY_CHECK_NETWORK: 'The app server could not reach Google. Try again shortly; this does not mean your key is invalid.',
    KEY_METADATA_UNAVAILABLE: 'Google’s model-list check is unavailable. Check Gemini API access or try again; this is not proof that the key is invalid.',
    KEY_PERMISSION: 'Google denied Gemini API access. Check your Google project permissions and the key’s API restrictions.',
  };
  if (failure.kind && Object.prototype.hasOwnProperty.call(keyFailures, failure.kind)) return keyFailures[failure.kind];
  if (/enter a valid google gemini api key/.test(normalized)) return 'Paste the complete Google Gemini API key, without spaces or extra text.';

  if (/app server|backend|session expired|session.*removed/.test(normalized)) {
    return 'The API session or app server is unavailable. Reconnect your key, or check your connection and try again.';
  }
  if (/quota|rate.?limit|resource_exhausted|429|billing/.test(normalized)) {
    return 'Google could not validate this key right now. Check that billing and paid image-generation access are enabled for its project, then try again.';
  }
  if (/invalid.*key|api.?key.*invalid|api.?key.*not valid|key.*not valid|unauthenticated|permission.?denied|forbidden|401|403/.test(normalized)) {
    return 'That key was not accepted. Check that it is copied correctly and belongs to a Google project with the Gemini API enabled.';
  }
  const code = Number(failure.code);
  const diagnostic = Number.isInteger(code) && code >= 400 && code <= 599 ? ` (HTTP ${code})` : '';
  return `Google could not complete the key check${diagnostic}. Try again; this failure does not establish that your key is invalid.`;
}

const GeminiConnection: React.FC<GeminiConnectionProps> = ({ disabled = false, onConnected }) => {
  const connected = useSyncExternalStore(
    subscribeGeminiConnection,
    hasGeminiKey,
    () => false,
  );
  const busy = useSyncExternalStore(
    subscribeGeminiConnection,
    isGeminiBusy,
    () => false,
  );
  const [keyInput, setKeyInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInformation, setShowInformation] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const locked = disabled || busy || confirming;

  useEffect(() => {
    if (!connected) {
      setConfirming(false);
      return;
    }
    if (!confirming || !onConnected) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let secondFrame: number | undefined;
    // Start the readable interval only after the committed success UI has painted.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        timer = setTimeout(onConnected, 1200);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
    };
  }, [connected, confirming, onConnected]);

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) return;
    setError(null);
    try {
      await connectGeminiKey(keyInput);
      setKeyInput('');
      setEditing(false);
      setConfirming(true);
    } catch (caught) {
      setError(readableConnectionError(caught));
    }
  };

  const handleRemove = async () => {
    if (locked) return;
    setError(null);
    try {
      await disconnectGeminiKey();
      setKeyInput('');
      setEditing(false);
    } catch (caught) {
      setError(readableConnectionError(caught));
    }
  };

  const startReplacing = () => {
    if (locked) return;
    setError(null);
    setKeyInput('');
    setEditing(true);
  };

  const keepCurrentKey = () => {
    if (locked) return;
    setKeyInput('');
    setError(null);
    setEditing(false);
  };

  return (
    <section
      aria-labelledby="gemini-connection-heading"
      className="mx-auto w-full"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-black pb-4">
        <div className="min-w-0">
          <h3 id="gemini-connection-heading" className="font-special-elite text-xl font-bold leading-tight text-black sm:text-2xl">
            {connected && !editing ? 'Your Google key' : editing ? 'Replace your Google key' : 'Connect your Google key'}
          </h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-2 border border-black px-2.5 py-1 font-open-sans text-base font-bold leading-6 ${
            connected
              ? 'bg-banana text-black'
              : 'bg-paper-light text-black'
          }`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full border border-black ${connected ? 'bg-black' : 'bg-transparent'}`} />
          {connected ? 'Key connected · checked' : 'No key connected'}
        </span>
      </div>

      {error && (
        <WarningNotice role="alert" title="Connection notice" className="mb-4" message={error} />
      )}
      {connected && !editing ? (
        <div className="space-y-4">
          <p className="font-open-sans text-base font-normal leading-6 text-gray-800">
            The metadata check confirms credential access only; it does not guarantee billing eligibility or model availability.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={startReplacing}
              disabled={locked}
              className="min-h-11 border-2 border-black bg-black px-5 py-2.5 font-open-sans text-base font-bold leading-6 text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Replace key
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={locked}
              className="min-h-11 border-2 border-black bg-paper-light px-5 py-2.5 font-open-sans text-base font-bold leading-6 text-black transition-colors hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Please wait…' : 'Remove key'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-3.5">
          <div>
            <label htmlFor="google-api-key" className="mb-1.5 block font-special-elite text-lg font-bold leading-6 text-black">
              Google API key
            </label>
            <input
              id="google-api-key"
              name="google-api-key"
              type="password"
              value={keyInput}
              onChange={(event) => {
                setKeyInput(event.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={locked}
              aria-describedby="key-check-status"
              aria-invalid={Boolean(error)}
              className="min-h-12 w-full min-w-0 border-2 border-black bg-white px-3 py-2 font-open-sans text-base font-normal leading-6 text-black placeholder:font-normal placeholder:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-gray-600"
              placeholder="Paste your Google API key"
            />
          </div>
          <p id="key-check-status" role={busy ? 'status' : undefined} className="font-open-sans text-base font-normal leading-6 text-gray-800">
            {busy
              ? 'A Google AI request is in progress; key changes are paused until it finishes.'
              : connected && editing
                ? 'We check access with model metadata only; no comic is generated. Your current key stays active unless this replacement passes.'
                : 'We check access with model metadata only; no comic is generated during connection.'}
          </p>

          <div className="flex flex-col items-end gap-2.5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="submit"
              disabled={locked || !keyInput.trim()}
              className="min-h-11 inline-flex items-center justify-center gap-3 px-8 py-4 bg-banana text-black font-bangers text-2xl tracking-wider border-2 border-t-black border-l-black border-r-black border-b-8 border-b-black hover:-translate-y-0.5 active:border-b-2 active:translate-y-0 active:mt-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {busy ? 'Checking key…' : connected ? 'Replace key' : 'Connect key'}
            </button>
            {connected && editing && (
              <button
                type="button"
                onClick={keepCurrentKey}
                disabled={locked}
                className="min-h-11 border-2 border-black bg-white px-5 py-2.5 font-open-sans text-base font-bold leading-6 text-black transition-colors hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Keep current key
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-5 border-t border-black pt-4">
        <button
          type="button"
          aria-expanded={showInformation}
          aria-controls="key-privacy"
          onClick={() => setShowInformation(value => !value)}
          className="min-h-11 py-2 text-left font-open-sans text-base font-bold leading-6 text-black underline underline-offset-2 hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Additional information <span aria-hidden="true">{showInformation ? '−' : '+'}</span>
        </button>
        <div id="key-privacy" hidden={!showInformation} className="pt-3">
        <p className="font-open-sans text-base font-normal leading-6 text-black">
          Your key stays in server memory for up to 30 minutes—never saved or logged. Reconnect after refreshing. Requests go through this server to Google and are billed to your Google project.
        </p>
        <p className="mt-2 font-open-sans text-base font-normal leading-6 text-gray-800">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-black underline decoration-2 underline-offset-2 hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            Google AI Studio
          </a>
          {' '}for a key. Check{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-black underline decoration-2 underline-offset-2 hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            Gemini API pricing
          </a>
          {' '}and project quotas before generating.
        </p>
        <div className="mt-4 space-y-1 border-t border-dotted border-black pt-3 font-open-sans text-base leading-6 text-black">
          <p><span className="font-special-elite font-bold">Default image model:</span> Nano Banana 2.1, the latest stable model.</p>
          <p><span className="font-special-elite font-bold">Alternative:</span> Nano Banana 2.5. Both require paid API image access; availability and quotas depend on your Google project.</p>
        </div>
        </div>
      </div>
    </section>
  );
};

export default GeminiConnection;
