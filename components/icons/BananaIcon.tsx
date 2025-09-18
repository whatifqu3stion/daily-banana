import React from 'react';

const BananaIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <defs>
      <linearGradient id="banana-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="55%" stopColor="#FFFFFF" /> {/* Lighter white */}
        <stop offset="65%" stopColor="#FACC15" /> {/* Vibrant yellow, starting lower */}
      </linearGradient>
    </defs>
    
    {/* Fill Path - now uses the gradient */}
    <path 
      d="M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z" 
      fill="url(#banana-gradient)"
      stroke="none" 
    />
    
    {/* Stroke Paths (the original icon paths) */}
    <path d="M4 13c3.5-2 8-2 10 2a5.5 5.5 0 0 1 8 5" fill="none" />
    <path d="M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z" fill="none" />
  </svg>
);

export default BananaIcon;