import React, { useState, useSyncExternalStore } from 'react';
import {
  connectGeminiKey,
  disconnectGeminiKey,
  hasGeminiKey,
  isGeminiBusy,
  subscribeGeminiConnection,
} from '../services/geminiConnection';

interface GeminiConnectionProps {
  disabled?: boolean;
}

function readableConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (/quota|rate.?limit|resource_exhausted|429|billing/.test(normalized)) {
    return 'Google could not validate this key right now. Check that billing and paid image-generation access are enabled for its project, then try again.';
  }
  if (/invalid.*key|api.?key.*invalid|api.?key.*not valid|key.*not valid|unauthenticated|permission.?denied|forbidden|401|403/.test(normalized)) {
    return 'That key was not accepted. Check that it is copied correctly and belongs to a Google project with the Gemini API enabled.';
  }
  return 'Google could not check this key. Check your connection and the key’s API access, then try again.';
}

const GeminiConnection: React.FC<GeminiConnectionProps> = ({ disabled = false }) => {
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
  const locked = disabled || busy;

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) return;
    setError(null);
    try {
      await connectGeminiKey(keyInput);
      setKeyInput('');
      setEditing(false);
    } catch (caught) {
      setError(readableConnectionError(caught));
    }
  };

  const handleRemove = () => {
    if (locked) return;
    setError(null);
    try {
      disconnectGeminiKey();
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
    setKeyInput('');
    setError(null);
    setEditing(false);
  };

  return (
    <section
      aria-labelledby="gemini-connection-heading"
      className="mx-auto w-full max-w-3xl border-2 border-black bg-paper-light p-5 sm:p-7"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-4">
        <div className="min-w-0">
          <h3 id="gemini-connection-heading" className="font-special-elite text-xl font-bold leading-tight text-black sm:text-2xl">
            Connect your Google key
          </h3>
          <p className="mt-1 font-open-sans text-base font-normal leading-7 text-gray-800">
            Your key lets the newsroom make comics on your Google project.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-2 border-2 px-3 py-1.5 font-open-sans text-sm font-bold leading-5 tracking-wide ${
            connected
              ? 'border-black bg-banana text-black'
              : 'border-black bg-white text-gray-800'
          }`}
          aria-live="polite"
        >
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border border-black ${connected ? 'bg-black' : 'bg-transparent'}`} />
          {connected ? 'Key connected · checked' : 'No key connected'}
        </span>
      </div>

      {connected && !editing ? (
        <div className="space-y-4">
          <div className="border border-black bg-white px-4 py-3">
            <p className="font-special-elite text-base font-bold leading-6 text-black">
              Google accepted the key check.
            </p>
            <p className="mt-1 font-open-sans text-base font-normal leading-6 text-gray-800">
              This confirms the credential was checked; it does not guarantee billing eligibility or that every model is available.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={startReplacing}
              disabled={locked}
              className="min-h-11 border-2 border-black bg-white px-5 py-2.5 font-open-sans text-base font-bold leading-6 text-black transition-colors hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Replace key
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={locked}
              className="min-h-11 border-2 border-black bg-black px-5 py-2.5 font-open-sans text-base font-bold leading-6 text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Please wait…' : 'Remove key'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label htmlFor="google-api-key" className="mb-1.5 block font-special-elite text-base font-bold leading-6 tracking-wide text-black">
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
              aria-describedby="key-privacy key-check-status"
              aria-invalid={Boolean(error)}
              className="min-h-12 w-full min-w-0 border-2 border-black bg-white px-3 py-2 font-open-sans text-base font-normal leading-6 text-black placeholder:font-normal placeholder:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-gray-600"
              placeholder="Paste your Google API key"
            />
          </div>
          <p id="key-check-status" className="font-open-sans text-base font-normal leading-6 text-gray-800">
            {busy
              ? 'A Google AI request is in progress. Key editing is paused until it finishes.'
              : 'We check access using a model metadata request only. No comic content is generated during connection.'}
          </p>

          {error && (
            <p role="alert" className="border-2 border-red-800 bg-red-50 px-3 py-2.5 font-open-sans text-base font-bold leading-6 text-red-950">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={locked || !keyInput.trim()}
              className="min-h-11 border-2 border-black bg-black px-5 py-2.5 font-open-sans text-base font-bold leading-6 text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            {busy && (
              <span role="status" className="font-open-sans text-base font-semibold leading-6 text-gray-800">
                Key changes are paused while a Google AI request is in progress.
              </span>
            )}
          </div>
        </form>
      )}

      <div id="key-privacy" className="mt-5 border-t-2 border-dotted border-black pt-4">
        <p className="font-open-sans text-base font-semibold leading-7 text-black">
          Your key stays in this browser tab only. Refreshing removes it. It is sent directly to Google; all AI calls are billed to your personal Google project.
        </p>
        <p className="mt-2 font-open-sans text-base font-normal leading-6 text-gray-800">
          Get a key at{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-black underline decoration-2 underline-offset-2 hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            Google AI Studio
          </a>
          . Review{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-black underline decoration-2 underline-offset-2 hover:bg-banana focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            Gemini API pricing
          </a>
          {' '}and your project’s quotas before generating.
        </p>
        <div className="mt-3 flex flex-col gap-1.5 border-l-4 border-black bg-banana/35 px-3 py-2.5 font-open-sans text-base font-normal leading-6 text-black">
          <p><span className="font-special-elite font-bold">Default image model:</span> Nano Banana 2.1, the latest stable model.</p>
          <p><span className="font-special-elite font-bold">Alternative:</span> Nano Banana 2.5. Both require paid API image access; availability and quotas depend on your Google project.</p>
        </div>
      </div>
    </section>
  );
};

export default GeminiConnection;
