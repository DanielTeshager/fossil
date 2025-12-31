// --- Keyboard Shortcuts Hook ---

import { useEffect, useCallback } from 'react';

/**
 * Register global keyboard shortcuts
 * @param {Object} shortcuts - Map of shortcut keys to handlers
 * @param {boolean} enabled - Whether shortcuts are active
 */
export const useKeyboardShortcuts = (shortcuts, enabled = true) => {
  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in inputs (unless it's Escape)
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    const isEscape = e.key === 'Escape';

    if (isInput && !isEscape) return;

    // Build shortcut key string
    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push('mod');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());

    const shortcutKey = parts.join('+');

    // Check for matching shortcut
    const handler = shortcuts[shortcutKey];
    if (handler) {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

/**
 * Common shortcut definitions
 */
export const SHORTCUT_KEYS = {
  COMMAND_PALETTE: 'mod+k',
  NEW_PROBE: 'mod+n',
  ESCAPE: 'escape',
  SAVE: 'mod+enter',
  SEARCH: 'mod+f',
  QUICK_CAPTURE: 'mod+shift+n',
};
