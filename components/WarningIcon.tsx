import React from 'react';

interface WarningIconProps {
  className?: string;
}

const WarningIcon: React.FC<WarningIconProps> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3.5 22 20.5H2L12 3.5Z" fill="#FACC15" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </svg>
);

export default WarningIcon;
