import React from 'react';

// A "b" drawn as a fountain pen: the stem is the pen, the bowl is a loop of ink.
export default function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 5.6a2 2 0 0 1 4 0V19h-4z" fill="#fff" />
      <path d="M10 20.4h4L12 27z" fill="#fff" />
      <circle cx="18.2" cy="19.2" r="5" fill="none" stroke="#fff" strokeWidth="2.3" />
    </svg>
  );
}
