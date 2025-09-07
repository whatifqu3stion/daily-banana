import React from 'react';

const WandIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
    <path d="M15 4V2" />
    <path d="M15 10V8" />
    <path d="M12.5 7.5L14 9" />
    <path d="M5 4v2" />
    <path d="M5 10v2" />
    <path d="M7.5 7.5L6 9" />
    <path d="M9 20v-5" />
    <path d="M15 20v-5" />
    <path d="M2 15h20" />
    <path d="M12 4.5v-3" />
    <path d="M10 2h4" />
    <path d="m21 15-2 5" />
    <path d="m3 15 2 5" />
  </svg>
);

export default WandIcon;
