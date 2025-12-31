// --- Command Palette Component ---

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Terminal, Archive, Calendar, GitBranch,
  Zap, Download, Settings, Plus, Sparkles, Brain,
  ArrowRight, Command
} from 'lucide-react';

/**
 * Simple fuzzy match scoring
 */
const fuzzyMatch = (query, text) => {
  if (!query) return { match: true, score: 0 };

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match gets highest score
  if (t === q) return { match: true, score: 100 };

  // Starts with gets high score
  if (t.startsWith(q)) return { match: true, score: 80 };

  // Contains gets medium score
  if (t.includes(q)) return { match: true, score: 60 };

  // Fuzzy character match
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      // Bonus for consecutive matches
      if (lastMatchIndex === ti - 1) score += 5;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    return { match: true, score };
  }

  return { match: false, score: 0 };
};

/**
 * Command Palette with fuzzy search
 */
export const CommandPalette = ({
  isOpen,
  onClose,
  fossils = [],
  onAction,
  currentView
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Build command list
  const commands = useMemo(() => [
    // Navigation
    { id: 'nav-today', type: 'navigation', label: 'Go to Today', icon: Terminal, action: () => onAction('navigate', 'today'), keywords: 'home probe capture' },
    { id: 'nav-archive', type: 'navigation', label: 'Go to Archive', icon: Archive, action: () => onAction('navigate', 'fossils'), keywords: 'fossils list search' },
    { id: 'nav-graph', type: 'navigation', label: 'Go to Graph', icon: GitBranch, action: () => onAction('navigate', 'graph'), keywords: 'connections map network' },
    { id: 'nav-harvest', type: 'navigation', label: 'Go to Harvest', icon: Calendar, action: () => onAction('navigate', 'harvest'), keywords: 'kernel weekly synthesis' },

    // Actions
    { id: 'action-new-probe', type: 'action', label: 'New Probe', icon: Plus, action: () => onAction('newProbe'), keywords: 'create start question' },
    { id: 'action-quick-capture', type: 'action', label: 'Quick Capture', icon: Zap, action: () => onAction('quickCapture'), keywords: 'fast note instant' },
    { id: 'action-ai-insight', type: 'action', label: 'AI Insight Spark', icon: Sparkles, action: () => onAction('aiInsight'), keywords: 'analyze pattern suggestion' },
    { id: 'action-ai-probe', type: 'action', label: 'AI Probe Suggestion', icon: Brain, action: () => onAction('aiProbe'), keywords: 'question idea generate' },
    { id: 'action-export', type: 'action', label: 'Export Vault', icon: Download, action: () => onAction('export'), keywords: 'backup json save' },
    { id: 'action-settings', type: 'action', label: 'AI Settings', icon: Settings, action: () => onAction('settings'), keywords: 'configure api key' },
  ], [onAction]);

  // Build fossil search results
  const fossilResults = useMemo(() => {
    if (!query || query.length < 2) return [];

    return fossils
      .filter(f => !f.deleted)
      .map(f => {
        const searchText = `${f.probeIntent} ${f.invariant} ${f.modelShift || ''}`;
        const { match, score } = fuzzyMatch(query, searchText);
        return { fossil: f, match, score };
      })
      .filter(r => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(r => ({
        id: `fossil-${r.fossil.id}`,
        type: 'fossil',
        label: r.fossil.invariant.slice(0, 60) + (r.fossil.invariant.length > 60 ? '...' : ''),
        sublabel: r.fossil.dayKey,
        icon: Archive,
        action: () => onAction('viewFossil', r.fossil),
        score: r.score
      }));
  }, [query, fossils, onAction]);

  // Filter and sort all results
  const results = useMemo(() => {
    const filtered = commands
      .map(cmd => {
        const searchText = `${cmd.label} ${cmd.keywords || ''}`;
        const { match, score } = fuzzyMatch(query, searchText);
        return { ...cmd, match, score };
      })
      .filter(r => r.match)
      .sort((a, b) => b.score - a.score);

    // Combine with fossil results
    return [...filtered, ...fossilResults].slice(0, 10);
  }, [commands, fossilResults, query]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current && results[selectedIndex]) {
      const item = listRef.current.children[selectedIndex];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          results[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className="w-5 h-5 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, fossils..."
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 outline-none font-mono text-sm"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-500">
            <Command className="w-3 h-3" />K
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-600 font-mono text-sm">
              No results found
            </div>
          ) : (
            results.map((result, index) => {
              const Icon = result.icon;
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={result.id}
                  onClick={() => {
                    result.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-emerald-950/50 text-emerald-400'
                      : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${
                    isSelected ? 'text-emerald-500' : 'text-zinc-600'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm truncate">
                      {result.label}
                    </div>
                    {result.sublabel && (
                      <div className="text-[10px] text-zinc-600 font-mono">
                        {result.sublabel}
                      </div>
                    )}
                  </div>
                  <div className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                    result.type === 'navigation'
                      ? 'bg-zinc-800 text-zinc-500'
                      : result.type === 'action'
                      ? 'bg-emerald-950 text-emerald-700'
                      : 'bg-amber-950 text-amber-700'
                  }`}>
                    {result.type}
                  </div>
                  {isSelected && (
                    <ArrowRight className="w-4 h-4 text-emerald-600" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-600">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↵</kbd> select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
