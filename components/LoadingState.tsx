import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  messages: string[];
  progress?: { current: number; total: number } | null;
}

const LoadingState: React.FC<LoadingStateProps> = ({ messages, progress }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (messages.length === 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let charIndex = 0;
    
    const type = () => {
      const currentMessage = messages[currentMessageIndex];
      if (charIndex < currentMessage.length) {
        setDisplayedText(currentMessage.substring(0, charIndex + 1));
        charIndex++;
        timeoutId = setTimeout(type, 50); // Typing speed
      } else {
        // Pause at the end of the message, then move to the next
        timeoutId = setTimeout(() => {
          charIndex = 0;
          setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
        }, 2000); // Pause duration
      }
    };

    // Start typing the new message
    type();

    return () => clearTimeout(timeoutId);
  }, [currentMessageIndex, messages]);

  return (
    <div className="w-full max-w-3xl mx-auto p-8 md:p-10 border-3 border-black bg-paper-light flex flex-col items-center justify-center min-h-[200px] shadow-xl rounded-lg">
      <div className="w-full max-w-xl text-center">
        <p className="mt-4 text-lg font-special-elite text-black break-words">
          {displayedText}
          <span className="blinking-cursor align-bottom">|</span>
        </p>
        {progress && progress.total > 0 && (
          <p className="mt-4 text-sm font-medium text-black">
            {`Panel generation progress: (${progress.current}/${progress.total})`}
          </p>
        )}
      </div>
    </div>
  );
};

export default LoadingState;