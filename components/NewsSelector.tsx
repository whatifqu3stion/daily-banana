import React, { useEffect, useRef, useState } from 'react';
import type { NewsFeed, NewsIssue, NewsStory } from '../types';
import WarningNotice from './WarningNotice';

interface NewsSelectorProps {
  feed: NewsFeed | null;
  isLoading: boolean;
  error: NewsIssue | null;
  onSelectStory: (story: NewsStory) => void;
  onClose: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onOpenApiSettings: () => void;
}

const getTimestampLabel = (fetchedAt: number): string | null => {
  const date = new Date(fetchedAt);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const getSuggestionsDocument = (renderedContent: string, nonce: string, parentOrigin: string): string => `<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script nonce="${nonce}">
document.addEventListener('keydown', function(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  parent.postMessage({type: 'daily-banana-news-close', token: ${JSON.stringify(nonce)}}, ${JSON.stringify(parentOrigin)});
});
</script>
</head>
<body>${renderedContent}</body>
</html>`;

const CloseMark: React.FC = () => (
  <span aria-hidden="true" className="text-[1.65rem] leading-none">×</span>
);

const NewsSelector: React.FC<NewsSelectorProps> = ({
  feed,
  isLoading,
  error,
  onSelectStory,
  onClose,
  onRetry,
  onRefresh,
  onOpenApiSettings,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const suggestionsRef = useRef<HTMLIFrameElement>(null);
  const [suggestionsNonce] = useState(() => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes));
  });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Install once for the lifetime of the modal; feed updates should never steal focus.
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    const focusInitialControl = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from<HTMLElement>(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], iframe, input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Events inside an opaque iframe never bubble into the parent document.
    // Accept only the nonce-restricted bridge's close event from our own frame.
    const handleFrameMessage = (event: MessageEvent) => {
      if (event.origin !== 'null' || event.source !== suggestionsRef.current?.contentWindow) return;
      if (event.data?.type === 'daily-banana-news-close' && event.data?.token === suggestionsNonce) onCloseRef.current();
    };
    window.addEventListener('message', handleFrameMessage);
    return () => {
      window.cancelAnimationFrame(focusInitialControl);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('message', handleFrameMessage);
      document.body.style.overflow = previousOverflow;
      if (dialog?.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  const fetchedAtLabel = feed ? getTimestampLabel(feed.fetchedAt) : null;
  const issue = error ?? feed?.warning ?? null;
  const hasStories = Boolean(feed?.stories.length);
  const isInitialLoading = isLoading && !feed;

  return (
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-selector-title"
        aria-describedby="news-selector-intro"
        tabIndex={-1}
        onCancel={event => { event.preventDefault(); onCloseRef.current(); }}
        onMouseDown={event => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
        }}
        className="relative m-auto max-h-[min(92dvh,58rem)] w-[calc(100%-1.5rem)] max-w-3xl flex-col overflow-hidden border-[3px] border-black bg-paper-light p-0 text-stone-900 shadow-xl backdrop:bg-black/65 open:flex focus:outline-none"
      >
        <header className="relative shrink-0 border-b-2 border-black bg-newsprint px-5 pb-4 pt-6 pr-14 sm:px-8 sm:pt-7 sm:pr-16">
          <h2 id="news-selector-title" className="text-center font-special-elite text-2xl font-bold leading-tight sm:text-3xl">
            Recent news ideas
          </h2>
          <p id="news-selector-intro" className="mx-auto mt-2 max-w-xl text-center font-open-sans text-base leading-relaxed text-stone-700">
            Browse recent coverage and pick a real-world starting point for your satire.
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close news selector"
            className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-transparent text-stone-700 hover:border-black hover:bg-paper-light hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:right-4 sm:top-4"
          >
            <CloseMark />
          </button>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-6"
          aria-busy={isLoading}
        >
          {!(error?.action === 'settings' && !hasStories) && <div className="mb-4 flex flex-col gap-3 border-b border-stone-400/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className={fetchedAtLabel ? undefined : 'w-full'}>
              {fetchedAtLabel ? (
                <p className="font-open-sans text-xs text-stone-600">
                  Headlines fetched <time dateTime={new Date(feed!.fetchedAt).toISOString()}>{fetchedAtLabel}</time>
                </p>
              ) : (
                <p className="text-center font-open-sans text-xs text-stone-600">
                  Searching coverage from the past 24 hours. Publication dates are not independently verified.
                </p>
              )}
              {isLoading && feed && (
                <p role="status" className="mt-1 font-open-sans text-xs font-semibold text-stone-700">
                  Refreshing headlines… your current results are still available.
                </p>
              )}
            </div>
            {hasStories && <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border-2 border-black bg-banana px-4 py-2 font-open-sans text-sm font-bold text-stone-900 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            >
              {isLoading ? 'Refreshing…' : 'Refresh headlines'}
            </button>}
          </div>}

          {isInitialLoading && (
            <div role="status" aria-live="polite" className="space-y-3 py-2">
              <p className="mb-4 text-center font-open-sans text-sm text-stone-700">
                Finding stories and preparing sourced snippets… This can take up to a minute.
              </p>
              <div className="border-2 border-stone-400 bg-white/70 p-4">
                <div className="h-5 w-3/4 animate-pulse bg-stone-300" />
                <div className="mt-3 h-3 w-full animate-pulse bg-stone-200" />
                <div className="mt-2 h-3 w-4/5 animate-pulse bg-stone-200" />
              </div>
              <div className="border-2 border-stone-400 bg-white/70 p-4">
                <div className="h-5 w-2/3 animate-pulse bg-stone-300" />
                <div className="mt-3 h-3 w-full animate-pulse bg-stone-200" />
                <div className="mt-2 h-3 w-3/4 animate-pulse bg-stone-200" />
              </div>
              <p className="pt-2 text-center font-open-sans text-xs text-stone-600">
                Closing this window will not undo any Google billing already incurred.
              </p>
            </div>
          )}

          {error?.action === 'settings' ? (
            <WarningNotice role="alert" title={error.title} message={error.message} className="mb-5">
              <button
                type="button"
                onClick={onOpenApiSettings}
                className="mt-3 min-h-11 border-2 border-black bg-black px-5 py-2.5 text-base font-bold text-white hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                Open API settings
              </button>
            </WarningNotice>
          ) : issue && (
            <div
              role={error ? 'alert' : 'status'}
              aria-live={error ? 'assertive' : 'polite'}
              className={`mb-5 border-2 p-4 ${error ? 'border-red-800 bg-[#f7e8dc]' : 'border-[#8b6b16] bg-[#fff4c7]'}`}
            >
              <h3 className="font-special-elite text-lg font-bold">{issue.title}</h3>
              <p className="mt-1 font-open-sans text-sm leading-relaxed">{issue.message}</p>
              {error?.action === 'retry' && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isLoading}
                  className="mt-3 min-h-11 border-2 border-black bg-paper-light px-4 py-2 font-open-sans text-sm font-bold hover:bg-newsprint disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {feed?.stale && (
            <p className="mb-4 border border-[#8b6b16] bg-[#fff4c7] px-3 py-2 font-open-sans text-sm leading-relaxed text-stone-800">
              Showing saved headlines from an earlier search. Refresh to look for newer coverage.
            </p>
          )}

          {!isInitialLoading && hasStories && (
            <ul className="space-y-4" aria-label="Recent news headlines">
              {feed!.stories.map((story, index) => (
                <li key={`${story.title}-${index}`} className="border-2 border-black bg-white">
                  <button
                    type="button"
                    onClick={() => onSelectStory(story)}
                    className="block min-h-11 w-full px-4 pb-3 pt-4 text-left transition-colors hover:bg-[#fff8dd] focus-visible:bg-[#fff8dd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black sm:px-5"
                  >
                    <strong className="block font-special-elite text-lg leading-snug text-stone-950 sm:text-xl">
                      {story.title}
                    </strong>
                    {story.description && (
                      <span className="mt-2 block font-open-sans text-base leading-relaxed text-stone-700">
                        {story.description}
                      </span>
                    )}
                  </button>
                  {story.sources && story.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-300 bg-[#f2eee3] px-4 py-2.5 font-open-sans text-sm sm:px-5">
                      <span className="font-bold uppercase tracking-wide text-stone-600">Source{story.sources.length === 1 ? '' : 's'}</span>
                      {story.sources.map((source, sourceIndex) => (
                        <a
                          key={`${source.url}-${sourceIndex}`}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-11 max-w-full break-words py-2 font-semibold text-[#5b4308] underline decoration-[#9a7921] underline-offset-2 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                        >
                          {source.title || 'Read source'}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!isInitialLoading && !hasStories && !error && (
            <div className="border-2 border-dashed border-stone-500 bg-newsprint/60 px-5 py-10 text-center">
              <p className="font-special-elite text-xl font-bold text-stone-800">
                The news desk is between editions.
              </p>
              <p className="mx-auto mt-2 max-w-md font-open-sans text-sm leading-relaxed text-stone-700">
                No headlines came through this time. Try another search, or close the desk and write from your own topic.
              </p>
            </div>
          )}

          {feed?.searchSuggestions && (
            <section className="mt-6 border-t-2 border-stone-400 pt-5" aria-labelledby="news-suggestions-title">
              <h3 id="news-suggestions-title" className="mb-3 font-special-elite text-lg font-bold">
                Related search suggestions
              </h3>
              <iframe
                ref={suggestionsRef}
                title="Related Google news search suggestions"
                srcDoc={getSuggestionsDocument(feed.searchSuggestions, suggestionsNonce, window.location.origin)}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className="block h-[22rem] w-full border-2 border-stone-500 bg-paper-light sm:h-[26rem]"
              />
              <p className="mt-2 font-open-sans text-xs text-stone-600">
                Suggestions are provided by Google and displayed in an isolated, read-only frame.
              </p>
            </section>
          )}
        </div>
      </dialog>
  );
};

export default NewsSelector;
