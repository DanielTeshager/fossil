// --- Harvest View Component ---

import React from 'react';
import { Calendar, Pin } from 'lucide-react';

export const HarvestView = ({
  // Data
  rankedCandidates,
  kernelInProgress,
  data,
  // Actions
  setKernelInProgress,
  sealKernel,
  setData
}) => {
  const isFriday = new Date().getDay() === 5;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      {!isFriday && (
        <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-2xl flex flex-col items-center text-center gap-6">
          <Calendar className="w-12 h-12 text-zinc-800" />
          <div className="space-y-2">
            <div className="text-zinc-500 font-mono text-sm uppercase tracking-widest font-bold">
              Persistence Active
            </div>
            <p className="text-zinc-700 text-xs font-mono italic max-w-xs leading-relaxed">
              Fossil collection ongoing. Harvest opens Friday.
            </p>
          </div>
        </div>
      )}
      {isFriday && (
        <div className="space-y-10 animate-in fade-in duration-500">
          <h2 className="text-3xl font-mono font-bold text-emerald-400 tracking-tighter uppercase">
            Weekly Collapse
          </h2>
          {rankedCandidates.length > 0 && (
            <div className="bg-emerald-950/10 border border-emerald-900/20 p-5 rounded-xl space-y-4">
              <div className="text-[10px] font-mono text-emerald-700 uppercase tracking-widest font-bold">
                Signal Surface
              </div>
              <div className="space-y-2">
                {rankedCandidates.map(f => (
                  <div
                    key={f.id}
                    className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 p-2 rounded text-zinc-400 flex justify-between"
                  >
                    <span className="truncate italic">"{f.invariant}"</span>
                    <span className="text-emerald-600 ml-4">score:{f.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-8">
            <textarea
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none"
              placeholder="Weekly invariant..."
              rows={3}
              value={kernelInProgress.invariant}
              onChange={(e) => setKernelInProgress({
                ...kernelInProgress,
                invariant: e.target.value
              })}
            />
            <input
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none"
              placeholder="Counterpoint..."
              value={kernelInProgress.counterpoint}
              onChange={(e) => setKernelInProgress({
                ...kernelInProgress,
                counterpoint: e.target.value
              })}
            />
            <input
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-sm font-mono text-zinc-300 focus:border-emerald-500/50 outline-none"
              placeholder="Next week's direction..."
              value={kernelInProgress.nextDirection}
              onChange={(e) => setKernelInProgress({
                ...kernelInProgress,
                nextDirection: e.target.value
              })}
            />
            <button
              onClick={sealKernel}
              disabled={!kernelInProgress.invariant?.trim()}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 font-mono font-bold text-white rounded-xl shadow-xl shadow-emerald-900/30 disabled:opacity-50"
            >
              SEAL WEEKLY KERNEL
            </button>
          </div>
        </div>
      )}
      <div className="space-y-6 pt-12 pb-20">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 border-b border-zinc-900 pb-3 font-bold">
          Kernel History
        </h3>
        {(!data.kernels || data.kernels.length === 0) ? (
          <div className="text-zinc-800 font-mono text-xs italic">
            Record empty.
          </div>
        ) : (
          data.kernels.map(k => (
            <div
              key={k.id}
              className={`p-6 rounded-xl border transition-all ${
                data.activeKernelId === k.id
                  ? 'bg-emerald-950/20 border-emerald-900'
                  : 'bg-zinc-900/30 border-zinc-800'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="text-[9px] font-mono text-emerald-800 uppercase font-bold tracking-widest">
                  Week of {new Date(k.date).toLocaleDateString()}
                </div>
                {data.activeKernelId !== k.id && (
                  <button
                    onClick={() => setData(prev => ({
                      ...prev,
                      activeKernelId: k.id
                    }))}
                    className="text-[9px] font-mono text-zinc-600 hover:text-emerald-500 uppercase flex items-center gap-1"
                  >
                    <Pin className="w-3 h-3" /> Set Active
                  </button>
                )}
              </div>
              <div className="text-zinc-200 font-mono text-sm mb-3 leading-relaxed">
                "{k.invariant}"
              </div>
              {k.nextDirection && (
                <div className="text-[9px] font-mono text-zinc-600 border-t border-zinc-800 pt-3 mt-3">
                  <span className="text-emerald-900 uppercase mr-2">Vector:</span>
                  {k.nextDirection}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HarvestView;
