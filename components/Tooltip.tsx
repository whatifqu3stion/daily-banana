// components/Tooltip.tsx
// A lightweight CSS-only tooltip that wraps any child in a scoped hover group and
// shows a dark label above it on hover. Supports top, top-left, and top-right
// positioning via the optional `position` prop.
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
    <div className={`relative flex items-center group/tooltip w-fit ${wrapperClassName || ''}`}>
      {children}
      <div role="tooltip" className={`absolute w-max max-w-xs px-3 py-1.5 bg-black text-white text-sm rounded-md shadow-lg pointer-events-none z-30 ${positionClasses[position]} invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 scale-95 group-hover/tooltip:scale-100`}>
        {text}
        <div className={`absolute top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black ${arrowClasses[position]}`}></div>
      </div>
    </div>
  );
};

export default Tooltip;