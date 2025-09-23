import React from 'react';

type TooltipPosition = 'top' | 'top-left' | 'top-right';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  wrapperClassName?: string;
  position?: TooltipPosition;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, wrapperClassName, position = 'top' }) => {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    'top-left': 'bottom-full left-0 mb-2',
    'top-right': 'bottom-full right-0 mb-2',
  };

  const arrowClasses = {
    top: 'left-1/2 -translate-x-1/2',
    'top-left': 'left-2',
    'top-right': 'right-2',
  };
  
  return (
    <div className={`relative flex items-center group w-fit ${wrapperClassName || ''}`}>
      {children}
      <div className={`absolute w-max max-w-xs px-3 py-1.5 bg-black text-white text-sm rounded-md shadow-lg pointer-events-none z-30 ${positionClasses[position]} invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100`}>
        {text}
        <div className={`absolute top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black ${arrowClasses[position]}`}></div>
      </div>
    </div>
  );
};

export default Tooltip;