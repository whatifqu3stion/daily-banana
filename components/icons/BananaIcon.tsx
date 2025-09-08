import React from 'react';

// A simple banana emoji icon with a drop shadow.
const BananaIcon: React.FC<React.HTMLProps<HTMLDivElement>> = (props) => (
  <div
    {...props}
    // The main container sets the size and centers content.
    className={`relative flex items-center justify-center w-16 h-16 ${props.className || ''}`}
  >
    <span
      role="img"
      aria-label="banana"
      // The emoji is positioned with a custom drop shadow.
      className="relative text-5xl"
      style={{ filter: 'drop-shadow(4px 4px 0.98px #6D4C4180)' }}
    >
      🍌
    </span>
  </div>
);

export default BananaIcon;