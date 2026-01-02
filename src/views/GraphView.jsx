// --- Graph View Component ---

import React from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Link2, Merge, X,
  ArrowRight, Edit3
} from 'lucide-react';
import { CLUSTER_COLORS } from '../utils/constants.js';

export const GraphView = ({
  // Data
  graphData,
  graphZoom,
  graphMode,
  connectSource,
  mergeTargets,
  manualEdges,
  nodeAnnotations,
  selectedGraphNode,
  editingAnnotation,
  fossilMap,
  // Actions
  setGraphZoom,
  setGraphMode,
  setConnectSource,
  setMergeTargets,
  setSelectedGraphNode,
  setEditingAnnotation,
  handleGraphNodeClick,
  handleMergeFossils,
  handleAddAnnotation,
  handleRemoveManualEdge,
  handleDrillDown
}) => {
  if (!graphData) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-20 text-zinc-800 font-mono text-sm border-2 border-dashed border-zinc-900 rounded-2xl">
          Computing graph...
        </div>
      </div>
    );
  }

  const { nodes, edges, clusterCount } = graphData;
  const width = 600;
  const height = 400;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-lg font-bold tracking-tighter uppercase text-white">
            Invariant Graph
          </h2>
          <span className="text-[9px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            {nodes.length} nodes | {edges.length} edges | {clusterCount} clusters
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setGraphZoom(z => Math.max(0.5, z - 0.25))}
            className="p-2 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-zinc-500" />
          </button>
          <button
            onClick={() => setGraphZoom(z => Math.min(2, z + 0.25))}
            className="p-2 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-zinc-500" />
          </button>
          <button
            onClick={() => { setGraphZoom(1); setSelectedGraphNode(null); }}
            className="p-2 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-colors"
            title="Reset"
          >
            <Maximize2 className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
      </div>

      {/* Mode Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => { setGraphMode('view'); setConnectSource(null); setMergeTargets([]); }}
            className={`px-3 py-1.5 text-[10px] font-mono rounded transition-colors ${
              graphMode === 'view' ? 'bg-emerald-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            VIEW
          </button>
          <button
            onClick={() => { setGraphMode('connect'); setSelectedGraphNode(null); setMergeTargets([]); }}
            className={`px-3 py-1.5 text-[10px] font-mono rounded transition-colors flex items-center gap-1 ${
              graphMode === 'connect' ? 'bg-cyan-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Link2 className="w-3 h-3" /> CONNECT
          </button>
          <button
            onClick={() => { setGraphMode('merge'); setSelectedGraphNode(null); setConnectSource(null); }}
            className={`px-3 py-1.5 text-[10px] font-mono rounded transition-colors flex items-center gap-1 ${
              graphMode === 'merge' ? 'bg-purple-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Merge className="w-3 h-3" /> MERGE
          </button>
        </div>

        {/* Mode instructions */}
        {graphMode === 'connect' && (
          <div className="text-[9px] font-mono text-cyan-600 bg-cyan-950/20 px-2 py-1 rounded border border-cyan-900/30">
            {connectSource ? 'Click target node to connect' : 'Click source node first'}
          </div>
        )}
        {graphMode === 'merge' && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-purple-600 bg-purple-950/20 px-2 py-1 rounded border border-purple-900/30">
              Selected: {mergeTargets.length}/3
            </span>
            {mergeTargets.length >= 2 && (
              <button
                onClick={handleMergeFossils}
                className="text-[9px] font-mono bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-500 transition-colors"
              >
                MERGE NOW
              </button>
            )}
          </div>
        )}

        {/* Manual connections count */}
        {manualEdges.length > 0 && (
          <div className="text-[9px] font-mono text-cyan-600 bg-cyan-950/20 px-2 py-1 rounded border border-cyan-900/30">
            {manualEdges.length} manual connection{manualEdges.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[9px] font-mono text-zinc-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-emerald-500"></div>
          <span>reentry chain</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-zinc-600" style={{borderTop: '1px dashed'}}></div>
          <span>semantic link</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-cyan-500"></div>
          <span>manual connection</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span>high value</span>
        </div>
      </div>

      {/* SVG Graph */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height: `${height * graphZoom}px`, maxHeight: '60vh' }}
        >
          {/* Edges */}
          {edges.map((edge, idx) => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            if (!source || !target) return null;

            const strokeColor = edge.type === 'reentry' ? '#10b981'
              : edge.type === 'manual' ? '#06b6d4'
              : '#3f3f46';

            return (
              <g key={idx}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={strokeColor}
                  strokeWidth={edge.type === 'reentry' ? 2 : edge.type === 'manual' ? 2 : 1}
                  strokeDasharray={edge.type === 'semantic' ? '4,4' : 'none'}
                  opacity={0.6}
                />
                {edge.type === 'manual' && edge.label && (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 5}
                    textAnchor="middle"
                    fill="#06b6d4"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Connection preview line */}
          {graphMode === 'connect' && connectSource && (() => {
            const sourceNode = nodes.find(n => n.id === connectSource);
            if (!sourceNode) return null;
            return (
              <line
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={sourceNode.x + 30}
                y2={sourceNode.y}
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="4,4"
                opacity={0.5}
              />
            );
          })()}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedGraphNode === node.id;
            const isConnectSource = connectSource === node.id;
            const isMergeTarget = mergeTargets.includes(node.id);
            const color = CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length];
            const hasAnnotation = nodeAnnotations[node.id];

            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.size / 2}
                  fill={color}
                  stroke={
                    isSelected ? '#fff'
                    : isConnectSource ? '#06b6d4'
                    : isMergeTarget ? '#a855f7'
                    : 'transparent'
                  }
                  strokeWidth={isSelected || isConnectSource || isMergeTarget ? 3 : 2}
                  className="cursor-pointer transition-all hover:opacity-80"
                  onClick={() => handleGraphNodeClick(node.id)}
                />
                {(isSelected || isMergeTarget) && (
                  <text
                    x={node.x}
                    y={node.y - node.size / 2 - 8}
                    textAnchor="middle"
                    fill={isMergeTarget ? '#a855f7' : '#fff'}
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {node.fossil.dayKey}
                  </text>
                )}
                {hasAnnotation && (
                  <circle
                    cx={node.x + node.size / 2 - 2}
                    cy={node.y - node.size / 2 + 2}
                    r={3}
                    fill="#f59e0b"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Node Details */}
      {selectedGraphNode && graphMode === 'view' && (() => {
        const node = nodes.find(n => n.id === selectedGraphNode);
        if (!node) return null;
        const f = node.fossil;
        const annotation = nodeAnnotations[node.id];

        return (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {f.dayKey}
                </span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase">{f.artifactType}</span>
                {f.reuseCount > 0 && (
                  <span className="text-[9px] font-mono text-emerald-600">{f.reuseCount} reuses</span>
                )}
              </div>
              <button
                onClick={() => setEditingAnnotation(editingAnnotation === node.id ? null : node.id)}
                className={`p-1.5 rounded transition-colors ${
                  annotation ? 'text-amber-500 hover:text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title="Add annotation"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            {editingAnnotation === node.id && (
              <div className="flex gap-2">
                <input
                  type="text"
                  defaultValue={annotation || ''}
                  placeholder="Add note..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-zinc-300 focus:border-amber-500/50 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddAnnotation(node.id, e.target.value);
                    }
                  }}
                  autoFocus
                />
                <button
                  onClick={(e) => handleAddAnnotation(node.id, e.target.previousSibling.value)}
                  className="px-2 py-1 bg-amber-600 text-white text-[10px] font-mono rounded hover:bg-amber-500"
                >
                  SAVE
                </button>
              </div>
            )}

            {annotation && !editingAnnotation && (
              <div className="text-[10px] font-mono text-amber-500 bg-amber-950/20 px-3 py-2 rounded border border-amber-900/30">
                {annotation}
              </div>
            )}

            <div className="text-emerald-400 font-mono text-sm leading-relaxed">
              {f.probeIntent}
            </div>
            <div className="text-zinc-300 font-mono text-sm italic">
              "{f.invariant}"
            </div>
            <div className="text-zinc-500 font-mono text-xs">
              {f.modelShift}
            </div>
            <button
              onClick={() => handleDrillDown(f)}
              className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
            >
              View in Archive <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        );
      })()}

      {/* Manual Edges List */}
      {manualEdges.length > 0 && (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="text-[10px] font-mono text-cyan-600 uppercase tracking-widest font-bold">
            Manual Connections
          </div>
          {manualEdges.map(edge => {
            const source = fossilMap[edge.source];
            const target = fossilMap[edge.target];
            if (!source || !target) return null;
            return (
              <div key={edge.id} className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                <span>
                  {source.dayKey} → {target.dayKey}
                  {edge.label && <span className="text-cyan-600 ml-2">"{edge.label}"</span>}
                </span>
                <button
                  onClick={() => handleRemoveManualEdge(edge.id)}
                  className="text-zinc-700 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {nodes.length === 0 && (
        <div className="text-center py-12 text-zinc-700 font-mono text-sm">
          No fossils to visualize yet. Create some fossils first.
        </div>
      )}
    </div>
  );
};

export default GraphView;
