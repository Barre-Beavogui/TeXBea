import React from 'react';

// A "b" drawn as a fountain pen: the stem is the pen, the bowl is a loop of ink.
export default function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M9 7a2.5 2.5 0 0 1 5 0v14.5H9z" fill="#fff" />
      <path d="M9 22.4h5v1.8L11.5 29 9 24.2z" fill="#fff" />
      <path d="M11.5 29v-4" stroke="currentColor" strokeWidth=".7" />
      <circle cx="19.8" cy="17.6" r="4.7" fill="none" stroke="#fff" strokeWidth="2.4" />
    </svg>
  );
}
