// --- Skip Link Component ---
// Accessibility: allows keyboard users to skip to main content

import React from 'react';

export const SkipLink = ({ targetId = 'main-content', children = 'Skip to main content' }) => (
  <a
    href={`#${targetId}`}
    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-emerald-600 focus:text-white focus:rounded-lg focus:font-mono focus:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
  >
    {children}
  </a>
);

export default SkipLink;
