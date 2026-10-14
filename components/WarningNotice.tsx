import React from 'react';
import WarningIcon from './WarningIcon';

interface WarningNoticeProps {
  title: string;
  role: 'alert' | 'note';
  centered?: boolean;
  className?: string;
  bodyId?: string;
  message: React.ReactNode;
  children?: React.ReactNode;
}

const WarningNotice = React.forwardRef<HTMLDivElement, WarningNoticeProps>(
  ({ title, role, centered = false, className = '', bodyId, message, children }, ref) => (
    <div
      ref={ref}
      role={role}
      className={`flex gap-3 border-2 border-black bg-banana/30 p-4 font-open-sans text-black ${
        centered ? 'flex-col items-center text-center' : 'items-start text-left'
      } ${className}`}
    >
      <WarningIcon className="h-7 w-7 flex-none" />
      <div className={`min-w-0 ${centered ? 'w-full' : 'flex-1'}`}>
        <p className="font-special-elite text-xl font-bold leading-snug">{title}</p>
        <p id={bodyId} className="mt-1 font-open-sans text-base font-normal leading-6">{message}</p>
        {children}
      </div>
    </div>
  ),
);

WarningNotice.displayName = 'WarningNotice';

export default WarningNotice;
