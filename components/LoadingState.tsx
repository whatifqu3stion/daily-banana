import React from 'react';

interface LoadingStateProps {
  message: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-white/70 backdrop-blur-sm my-8 border-2 border-black">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-black"></div>
      <p className="mt-4 text-lg font-medium text-black">{message}</p>
      <p className="mt-2 text-sm text-black">Please wait, magic is happening...</p>
    </div>
  );
};

export default LoadingState;