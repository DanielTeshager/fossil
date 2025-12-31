// --- Quick Capture Component ---

import React, { useState, useEffect, useRef } from 'react';
import { Zap, X, ChevronDown, ChevronUp } from 'lucide-react';
import { generateId, getDayKey } from '../utils/helpers.js';

/**
 * Quick Capture - minimal friction fossil creation
 * Just invariant + optional primitive, expands if needed
 */
export const QuickCapture = ({
  isOpen,
  onClose,
  onCapture,
  existingProbe = null
}) => {
  const [invariant, setInvariant] = useState('');
  const [primitive, setPrimitive] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [probeIntent, setProbeIntent] = useState('');
  const inputRef = useRef(null);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setInvariant('');
      setPrimitive('');
      setProbeIntent(existingProbe?.intent || '');
      setExpanded(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, existingProbe]);

  const handleSubmit = (e) => {
    e?.preventDefault();

    if (!invariant.trim()) return;

    const fossil = {
      id: generateId(),
      dayKey: getDayKey(),
      createdAt: new Date().toISOString(),
      probeIntent: probeIntent.trim() || 'Quick capture',
      primitives: primitive.trim()
        ? primitive.split(',').map(p => p.trim()).filter(Boolean).slice(0, 3)
        : ['Quick capture'],
      invariant: invariant.trim(),
      modelShift: 'Quick Mode Closure.',
      quality: 1,
      artifactType: 'Note',
      payload: '',
      reentryOf: existingProbe?.reentryOf || null,
      duration: existingProbe
        ? Math.floor((Date.now() - existingProbe.startTime) / 1000)
        : 0,
      deleted: false,
      reuseCount: 0
    };

    onCapture(fossil);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="font-mono text-sm text-amber-500 font-bold uppercase tracking-wider">
              Quick Capture
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Invariant - Main Input */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
              Invariant <span className="text-amber-600">*</span>
            </label>
            <textarea
              ref={inputRef}
              value={invariant}
              onChange={e => setInvariant(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the core truth?"
              rows={2}
              className="w-full bg-black border border-zinc-800 rounded-lg p-3 font-mono text-emerald-400 text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30 outline-none placeholder-zinc-700 resize-none"
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          {/* Primitive - Optional */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
              Primitives <span className="text-zinc-700">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              value={primitive}
              onChange={e => setPrimitive(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="concept1, concept2, concept3"
              className="w-full bg-black border border-zinc-800 rounded-lg p-3 font-mono text-zinc-300 text-sm focus:border-zinc-600 outline-none placeholder-zinc-700"
              autoComplete="off"
            />
          </div>

          {/* Expandable Section */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less options' : 'More options'}
          </button>

          {expanded && (
            <div className="space-y-4 pt-2 border-t border-zinc-800">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                  Probe Intent
                </label>
                <input
                  type="text"
                  value={probeIntent}
                  onChange={e => setProbeIntent(e.target.value)}
                  placeholder="What question led to this?"
                  className="w-full bg-black border border-zinc-800 rounded-lg p-3 font-mono text-zinc-300 text-sm focus:border-zinc-600 outline-none placeholder-zinc-700"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-[10px] font-mono text-zinc-600">
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">⌘↵</kbd> to capture
            </div>
            <button
              type="submit"
              disabled={!invariant.trim()}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-mono font-bold text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              CAPTURE
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickCapture;
