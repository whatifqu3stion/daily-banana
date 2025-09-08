import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  message: string;
  progress?: { current: number; total: number } | null;
}

const LoadingState: React.FC<LoadingStateProps> = ({ message, progress }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    // Immediately set a placeholder to establish height
    setDisplayedText('...'); 
    
    const type = (currentIndex = 0) => {
      if (currentIndex <= message.length) {
        setDisplayedText(message.substring(0, currentIndex));
        timeoutId = setTimeout(() => type(currentIndex + 1), 70);
      } else {
        // Pause at the end, then restart
        timeoutId = setTimeout(() => type(0), 1500);
      }
    };

    timeoutId = setTimeout(() => type(0), 100); // Initial delay

    return () => clearTimeout(timeoutId);
  }, [message]);

  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-white/70 backdrop-blur-sm my-8 border-2 border-black min-h-[144px]">
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
