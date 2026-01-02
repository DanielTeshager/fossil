// --- Today View Component ---

import React from 'react';
import {
  CheckCircle2, AlertCircle, ArrowRight, Star, FastForward,
  Pin, RefreshCw, RotateCcw, Check, X, Sparkles
} from 'lucide-react';
import { PROBE_TEMPLATES } from '../utils/constants.js';
import { isValidUrl } from '../utils/helpers.js';
import { ProactiveInsights } from '../components/ProactiveInsights.jsx';

export const TodayView = ({
  // Data
  activeKernel,
  todayFossil,
  todayKey,
  data,
  visibleFossils,
  fossilTokenIndex,
  resurfaceFossil,
  reentryWarning,
  canSeal,
  now,
  // Form state
  mode,
  setMode,
  intent,
  setIntent,
  compression,
  setCompression,
  fossilType,
  setFossilType,
  payload,
  setPayload,
  // Actions
  setData,
  setView,
  setFocusChainIds,
  handleSealWithConflictCheck,
  handleDrillDown,
  handleResurfaceChallenge,
  handleResurfaceReinforce,
  handleResurfaceDismiss,
  handleAIInsightSpark
}) => (
  <div className="p-6 max-w-2xl mx-auto space-y-8 py-6">
    {activeKernel && (
      <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
        <Pin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-emerald-600 uppercase tracking-widest font-bold">
            Active Kernel
          </div>
          <div className="text-zinc-200 font-mono text-xs leading-relaxed italic">
            "{activeKernel.invariant}"
          </div>
          {activeKernel.nextDirection && (
            <div className="text-[10px] font-mono text-zinc-500 mt-1">
              <span className="text-emerald-900 mr-2 uppercase">Direction:</span>
              {activeKernel.nextDirection}
            </div>
          )}
        </div>
      </div>
    )}

    {/* Proactive Insights */}
    {!data.activeProbe && !todayFossil && visibleFossils.length >= 5 && (
      <ProactiveInsights
        fossils={visibleFossils}
        kernels={data.kernels || []}
        tokenIndex={fossilTokenIndex}
        onNavigateToFossil={(id) => {
          setFocusChainIds([id]);
          setView('fossils');
        }}
        onNavigateToGraph={() => setView('graph')}
        onStartProbe={() => document.querySelector('textarea')?.focus()}
        aiConfig={data.aiConfig}
        onRequestAIInsight={handleAIInsightSpark}
      />
    )}

    {/* Resurface Prompt */}
    {resurfaceFossil && !todayFossil && !data.activeProbe && (
      <div className="bg-amber-950/10 border border-amber-900/30 p-5 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-mono text-amber-600 uppercase tracking-widest font-bold">
              Resurface
            </span>
          </div>
          <button
            onClick={handleResurfaceDismiss}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Dismiss (will resurface later)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-zinc-200 font-mono text-sm leading-relaxed italic">
          "{resurfaceFossil.invariant}"
        </div>
        <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-600">
          <span>{resurfaceFossil.dayKey}</span>
          <span>quality:{resurfaceFossil.quality || 2}</span>
          {resurfaceFossil.reuseCount > 0 && <span>{resurfaceFossil.reuseCount} reuses</span>}
          {resurfaceFossil.reinforceCount > 0 && <span>{resurfaceFossil.reinforceCount} reinforced</span>}
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleResurfaceChallenge}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            CHALLENGE
          </button>
          <button
            onClick={handleResurfaceReinforce}
            className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-zinc-700"
          >
            <Check className="w-3.5 h-3.5" />
            STILL HOLDS
          </button>
        </div>
      </div>
    )}

    {todayFossil ? (
      <div className="py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 text-center">
        <div className="py-12 border border-zinc-800 bg-zinc-900/30 rounded-2xl">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-mono font-bold text-white uppercase tracking-tighter">
            Loop Closed
          </h2>
          <p className="text-zinc-500 mt-2 text-sm font-mono">
            Loop verified for {todayKey}.
          </p>
        </div>
      </div>
    ) : !data.activeProbe ? (
      <div className="py-6 space-y-8 animate-in fade-in">
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Initiate Probe
            </label>
            <div className="flex gap-2">
              {PROBE_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setIntent(t.intent)}
                  className="text-[9px] font-mono border border-zinc-800 rounded px-2 py-0.5 hover:border-emerald-900 hover:text-emerald-500 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="w-full bg-black border border-zinc-800 rounded-xl p-5 font-mono text-emerald-400 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none placeholder-zinc-800 text-lg leading-snug"
            placeholder="What are you probing today?"
            rows={3}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
          {reentryWarning && (
            <div className="flex items-start gap-3 p-4 bg-amber-950/10 border border-amber-900/30 rounded-xl text-amber-200 text-xs font-mono animate-pulse">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-amber-500 font-bold uppercase tracking-tighter flex items-center gap-2">
                  <RefreshCw className="w-3 h-3" /> Potential Re-entry
                </span>
                <div className="mt-1 opacity-60 italic">
                  "{reentryWarning.invariant}"
                </div>
                <button
                  onClick={() => handleDrillDown(reentryWarning)}
                  className="mt-2 text-amber-500 underline flex items-center gap-1"
                >
                  Examine Chain <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          disabled={!intent?.trim()}
          onClick={() => setData(prev => ({
            ...prev,
            activeProbe: {
              intent: intent.trim(),
              startTime: Date.now(),
              reentryOf: reentryWarning?.id || null
            }
          }))}
          className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-900 disabled:text-zinc-700 font-mono font-bold text-white rounded-xl transition-all shadow-xl shadow-emerald-900/10"
        >
          START PROBE
        </button>
      </div>
    ) : (
      <div className="space-y-8 py-4 animate-in fade-in duration-700">
        <div className="flex justify-between items-start border-b border-zinc-800 pb-6">
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Active Probe
            </div>
            <div className="text-xl text-emerald-400 font-mono font-bold leading-tight">
              {data.activeProbe.intent}
            </div>
            <div className="flex gap-4 items-center pt-2">
              <button
                onClick={() => setMode('standard')}
                className={`flex items-center gap-1 text-[10px] font-mono ${
                  mode === 'standard'
                    ? 'text-emerald-500'
                    : 'text-zinc-700 hover:text-zinc-500'
                }`}
              >
                <Star className="w-3 h-3" /> Standard
              </button>
              <button
                onClick={() => setMode('quick')}
                className={`flex items-center gap-1 text-[10px] font-mono ${
                  mode === 'quick'
                    ? 'text-amber-500'
                    : 'text-zinc-700 hover:text-zinc-500'
                }`}
              >
                <FastForward className="w-3 h-3" /> Quick Mode
              </button>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-4 tabular-nums text-2xl font-mono text-zinc-500">
            {String(Math.floor((now - data.activeProbe.startTime) / 60000)).padStart(2, '0')}:
            {String(Math.floor(((now - data.activeProbe.startTime) % 60000) / 1000)).padStart(2, '0')}
          </div>
        </div>

        <div className="space-y-8 pb-20">
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {mode === 'quick' ? 'Emergency Capture' : 'Primitives (3 Required)'}
              </label>
              <span className="text-[10px] font-mono text-zinc-700">
                {mode === 'quick'
                  ? 'Fast Mode'
                  : `${compression.primitives.filter(p => p?.trim()).length}/3`}
              </span>
            </div>
            {mode === 'quick' ? (
              <textarea
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none h-20"
                placeholder="Enter primitives, one per line..."
                value={compression.quickPrimitives}
                onChange={(e) => setCompression({
                  ...compression,
                  quickPrimitives: e.target.value
                })}
              />
            ) : (
              compression.primitives.map((p, i) => (
                <input
                  key={i}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none"
                  placeholder={`Primitive ${i + 1}`}
                  value={p}
                  onChange={(e) => {
                    const next = [...compression.primitives];
                    next[i] = e.target.value;
                    setCompression({...compression, primitives: next});
                  }}
                />
              ))
            )}
          </div>

          <div className="grid gap-6">
            <div className="space-y-2">
              <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Invariant
              </label>
              <input
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none"
                placeholder="The core survival..."
                value={compression.invariant}
                onChange={(e) => setCompression({
                  ...compression,
                  invariant: e.target.value
                })}
              />
            </div>
            {mode === 'standard' && (
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Model Shift
                </label>
                <input
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none"
                  placeholder="What changed?"
                  value={compression.modelShift}
                  onChange={(e) => setCompression({
                    ...compression,
                    modelShift: e.target.value
                  })}
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Externalize
            </label>
            <div className="flex gap-2 flex-wrap">
              {['Note', 'Code', 'Post', 'Link'].map(type => (
                <button
                  key={type}
                  onClick={() => setFossilType(type)}
                  className={`py-1.5 px-4 text-[10px] font-mono border rounded-full transition-all ${
                    fossilType === type
                      ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                      : 'border-zinc-800 text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea
              className={`w-full bg-black border rounded-xl p-4 text-sm font-mono focus:border-emerald-500/50 outline-none h-32 leading-relaxed transition-colors ${
                fossilType === 'Link' && payload && !isValidUrl(payload)
                  ? 'border-red-900 text-red-400'
                  : 'border-zinc-800 text-zinc-400'
              }`}
              placeholder={fossilType === 'Link' ? 'https://...' : `Externalize artifact...`}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </div>

          <button
            onClick={handleSealWithConflictCheck}
            disabled={!canSeal}
            className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-10 disabled:grayscale font-mono font-bold text-white rounded-xl shadow-xl shadow-emerald-900/20 transition-all"
          >
            SEAL FOSSIL
          </button>
        </div>
      </div>
    )}
  </div>
);

export default TodayView;
