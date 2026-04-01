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
    <div className="w-full max-w-3xl mx-auto p-8 md:p-10 border-3 border-black bg-paper-light flex flex-col items-center justify-center min-h-[200px] shadow-xl rounded-lg">
      <div className="w-full max-w-xl text-center">
        <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-black mx-auto mb-6" />

        <p className="text-lg font-special-elite text-black break-words min-h-[1.75rem]">
          {displayedText}
          <span className="blinking-cursor align-bottom">|</span>
        </p>

        {progress && progress.total > 0 && (
          <div className="mt-6 w-full">
            <div className="flex justify-between text-sm font-special-elite text-black mb-2">
              <span>Panel {progress.current} of {progress.total}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-black/10 rounded-sm h-4 border-2 border-black overflow-hidden">
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
