import React from 'react';

const NewspaperIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2h0a2 2 0 0 0-2-2V8a2 2 0 0 1 2-2h8" />
    <path d="M18 12H8" />
    <path d="M18 16H8" />
    <path d="M14 8h-4" />
  </svg>
);

export default NewspaperIcon;
