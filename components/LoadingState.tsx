// components/LoadingState.tsx
// Animated loading screen shown during multi-step AI generation.
// Cycles through a list of status messages with a typewriter effect and
// optionally renders a per-panel progress bar during image generation.
import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  messages: string[];
  progress?: { current: number; total: number } | null;
}

const LoadingState: React.FC<LoadingStateProps> = ({ messages, progress }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setCurrentMessageIndex(0);
    setDisplayedText('');
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let charIndex = 0;

    const type = () => {
      const currentMessage = messages[currentMessageIndex];
      if (!currentMessage) return;
      if (charIndex < currentMessage.length) {
        setDisplayedText(currentMessage.substring(0, charIndex + 1));
        charIndex++;
        timeoutId = setTimeout(type, 40);
      } else {
        timeoutId = setTimeout(() => {
          charIndex = 0;
          setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
        }, 2000);
      }
    };

    type();
    return () => clearTimeout(timeoutId);
  }, [currentMessageIndex, messages]);

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null;

  return (
    <div className="w-full max-w-3xl mx-auto p-6 md:p-10 border-3 border-black bg-paper-light flex flex-col items-center justify-center min-h-[260px] shadow-xl rounded-lg" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-xl text-center">
        {progressPercent !== null && (
          <div className="mb-6 flex justify-center gap-2" aria-hidden="true">
            {[0, 1, 2].map(i => <span key={i} className="h-3 w-3 rounded-full bg-banana border-2 border-black" />)}
          </div>
        )}
        <p className="mb-2 text-xs font-open-sans font-bold uppercase tracking-[0.18em] text-gray-500">The newsroom is at work</p>
        <p className="sr-only" role="status">The newsroom is working on your comic. {progress && progress.total > 0 ? `Panel ${progress.current} of ${progress.total}.` : 'Preparing the next stage.'}</p>
        <p aria-hidden="true" className="text-lg font-special-elite text-black break-words min-h-[1.75rem]">
          {displayedText}
          <span className="blinking-cursor align-bottom">|</span>
        </p>

        {progress && progress.total > 0 && (
          <div className="mt-6 w-full">
            <div className="flex justify-between text-sm font-special-elite text-black mb-2">
              <span>Panel {progress.current} of {progress.total}</span>
              <span>{progressPercent}%</span>
            </div>
              <div className="w-full bg-black/10 rounded-sm h-4 border-2 border-black overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent ?? 0}>
              <div
                className="bg-banana h-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingState;
