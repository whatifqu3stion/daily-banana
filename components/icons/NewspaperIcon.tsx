import React from 'react';

const NewspaperIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    fill="none"
    {...props}
  >
    {/* Use two overlapping paths for a solid, glitch-free fill */}
    <path
      d="M4 22V8a2 2 0 0 1 2-2h8v16H6a2 2 0 0 1-2-2z"
      className="fill-banana"
      stroke="none"
    />
    <path
      d="M8 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8V2z"
      className="fill-banana"
      stroke="none"
    />

    {/* Draw the outline and details on top */}
    <path d="M8 2v20" />
    <path d="M8 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    
    {/* Lines for text simulation */}
    <path d="M18 12H8" />
    <path d="M18 16H8" />
    <path d="M14 8h-4" />
  </svg>
);

export default NewspaperIcon;