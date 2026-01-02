// --- Archive View Component ---

import React from 'react';
import {
  Search, Download, Save, Upload, Trash2, Copy,
  Target, X, Flame, History, Database, ChevronUp
} from 'lucide-react';

export const ArchiveView = ({
  // Data
  streakStats,
  focusChainIds,
  filteredFossils,
  fossilMap,
  searchQuery,
  fileInputRef,
  // Actions
  setFocusChainIds,
  setSearchQuery,
  exportMarkdown,
  handleExportJSON,
  handleImportJSON,
  getTrail,
  handleDrillDown,
  copyFossilMarkdown,
  deleteFossil
}) => (
  <div className="p-6 max-w-3xl mx-auto space-y-6">
    {/* Streak Banner */}
    {streakStats.current > 0 && (
      <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-emerald-500" />
            <span className="text-2xl font-mono font-bold text-emerald-400">{streakStats.current}</span>
            <span className="text-[10px] font-mono text-emerald-700 uppercase">day streak</span>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="text-[10px] font-mono text-zinc-600">
            <span className="text-zinc-400">{streakStats.longest}</span> longest |{' '}
            <span className="text-zinc-400">{streakStats.total}</span> total
          </div>
        </div>
        {streakStats.current >= 7 && (
          <div className="text-[9px] font-mono text-amber-600 bg-amber-950/20 px-2 py-1 rounded border border-amber-900/30">
            {streakStats.current >= 30 ? 'LEGENDARY' : streakStats.current >= 14 ? 'ON FIRE' : 'BUILDING'}
          </div>
        )}
      </div>
    )}

    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div className="flex items-center gap-3">
        <h2 className="font-mono text-lg font-bold tracking-tighter uppercase text-white">
          Archives
        </h2>
        {focusChainIds && (
          <div className="flex items-center gap-1.5 text-[9px] font-mono bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded text-emerald-500">
            <Target className="w-2.5 h-2.5" /> FOCUSED TRAIL
            <button
              onClick={() => setFocusChainIds(null)}
              className="ml-1 hover:text-white"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <div className="relative flex-grow sm:flex-grow-0">
          <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs font-mono focus:outline-none focus:border-zinc-600 w-full text-zinc-200"
            placeholder="Search concepts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={exportMarkdown}
          className="p-2 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
          title="Export Markdown"
        >
          <Download className="w-4 h-4 text-zinc-500" />
        </button>
        <button
          onClick={handleExportJSON}
          className="p-2 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
          title="Export JSON Backup"
        >
          <Save className="w-4 h-4 text-zinc-500" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
          title="Import JSON Backup"
        >
          <Upload className="w-4 h-4 text-zinc-500" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportJSON}
          className="hidden"
        />
      </div>
    </div>

    <div className="space-y-6 pb-20">
      {filteredFossils.length === 0 ? (
        <div className="text-center py-20 text-zinc-800 font-mono text-sm border-2 border-dashed border-zinc-900 rounded-2xl">
          Record empty.
        </div>
      ) : (
        filteredFossils.map(f => {
          const trail = getTrail(f);
          return (
            <div
              key={f.id}
              className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 group hover:border-zinc-700 transition-all space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 uppercase">
                    {f.dayKey}
                  </span>
                  {trail.length > 0 && (
                    <button
                      onClick={() => handleDrillDown(f)}
                      className="flex items-center gap-1 text-[9px] font-mono text-amber-600 px-2 bg-amber-950/10 border border-amber-900/30 rounded hover:border-amber-500 transition-colors"
                    >
                      <History className="w-2.5 h-2.5" /> {trail.length} HOPS
                    </button>
                  )}
                  {f.reuseCount > 0 && (
                    <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-600 px-2 bg-emerald-950/10 border border-emerald-900/30 rounded">
                      <Database className="w-2.5 h-2.5" /> {f.reuseCount} REUSES
                    </div>
                  )}
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    {f.artifactType}
                  </span>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => copyFossilMarkdown(f)}
                    className="p-1 text-zinc-700 hover:text-emerald-500"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteFossil(f.id)}
                    className="p-1 text-zinc-700 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-emerald-400 font-mono text-lg leading-tight">
                {f.probeIntent}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
                <div className="space-y-2">
                  <div className="text-zinc-600 font-bold uppercase text-[9px] tracking-widest">
                    Invariant
                  </div>
                  <div className="text-zinc-300 leading-relaxed italic">
                    "{f.invariant}"
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-zinc-600 font-bold uppercase text-[9px] tracking-widest">
                    Model Shift
                  </div>
                  <div className="text-zinc-400 leading-relaxed">
                    {f.modelShift}
                  </div>
                </div>
              </div>
              {f.reentryOf && fossilMap[f.reentryOf] && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/50 space-y-2">
                  <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-600 uppercase">
                    <ChevronUp className="w-3 h-3" /> Ancestor Trace
                  </div>
                  <div className="text-[10px] text-zinc-500 italic">
                    "{fossilMap[f.reentryOf].invariant}"
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  </div>
);

export default ArchiveView;
