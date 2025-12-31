// --- Proactive Insights Component ---

import React, { useState, useMemo } from 'react';
import {
  Sparkles, Brain, Link2, TrendingUp, AlertTriangle,
  ChevronRight, X, GitBranch, Zap, RefreshCw, Lightbulb
} from 'lucide-react';
import { tokenize } from '../utils/tokenizer.js';
import { detectClusters, findBridgeFossils, suggestConnections } from '../utils/autolink.js';

/**
 * Analyze vault for patterns and insights
 * @param {Array} fossils - All fossils
 * @param {Map} tokenIndex - Token index for similarity
 * @param {Array} kernels - All kernels (to check which fossils are synthesized)
 */
const analyzeVault = (fossils, tokenIndex, kernels = []) => {
  const validFossils = fossils.filter(f => !f.deleted);
  if (validFossils.length < 3) return null;

  const insights = [];
  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Recent fossils
  const recentFossils = validFossils.filter(f => new Date(f.createdAt) > last7Days);
  const monthFossils = validFossils.filter(f => new Date(f.createdAt) > last30Days);

  // 1. Topic Concentration Detection
  const tokenFreq = new Map();
  recentFossils.forEach(f => {
    const tokens = tokenIndex.get(f.id) || tokenize(f.invariant || '');
    tokens.forEach(t => {
      if (t.length > 3) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
    });
  });

  const topTopics = [...tokenFreq.entries()]
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topTopics.length > 0) {
    insights.push({
      type: 'pattern',
      icon: TrendingUp,
      title: 'Topic Focus',
      message: `You've explored "${topTopics[0][0]}" ${topTopics[0][1]} times this week`,
      action: topTopics[0][0],
      priority: 2
    });
  }

  // 2. Synthesis Readiness
  // Build set of fossil IDs that are already in kernels
  const synthesizedIds = new Set();
  kernels.forEach(k => {
    (k.fossilIds || []).forEach(id => synthesizedIds.add(id));
  });

  const clusters = detectClusters(validFossils, tokenIndex, { minClusterSize: 3 });
  const unsyntheized = clusters.filter(c => {
    // Check if majority of fossils in cluster are NOT synthesized
    const unsynthCount = c.fossils.filter(f => !synthesizedIds.has(f.id)).length;
    return unsynthCount >= c.fossils.length * 0.5; // At least 50% unsynthesized
  });

  if (unsyntheized.length > 0 && unsyntheized[0].size >= 4) {
    insights.push({
      type: 'synthesis',
      icon: Sparkles,
      title: 'Ready for Synthesis',
      message: `${unsyntheized[0].size} fossils about "${unsyntheized[0].theme.join(', ')}" could form a kernel`,
      clusterIds: unsyntheized[0].ids,
      priority: 1
    });
  }

  // 3. Cross-Domain Bridges
  const bridges = findBridgeFossils(validFossils, tokenIndex);
  if (bridges.length > 0) {
    const bridge = bridges[0];
    insights.push({
      type: 'bridge',
      icon: GitBranch,
      title: 'Cross-Domain Connection',
      message: `"${bridge.fossil.invariant.slice(0, 40)}..." connects ${bridge.connections.length} different topics`,
      fossilId: bridge.fossil.id,
      priority: 2
    });
  }

  // 4. Gap Detection
  const daysSinceLastFossil = validFossils.length > 0
    ? Math.floor((now - new Date(validFossils.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt)) / (1000 * 60 * 60 * 24))
    : 0;

  if (daysSinceLastFossil >= 3) {
    insights.push({
      type: 'gap',
      icon: AlertTriangle,
      title: 'Capture Gap',
      message: `${daysSinceLastFossil} days since your last fossil. What have you been thinking about?`,
      priority: 0
    });
  }

  // 5. Connection Suggestions
  const suggestions = suggestConnections(validFossils, tokenIndex);
  if (suggestions.length >= 3) {
    insights.push({
      type: 'connections',
      icon: Link2,
      title: 'Hidden Connections',
      message: `Found ${suggestions.length} potential connections between your fossils`,
      suggestions: suggestions.slice(0, 3),
      priority: 3
    });
  }

  // 6. Quality Trend
  const recentQuality = recentFossils.length > 0
    ? recentFossils.reduce((sum, f) => sum + (f.quality || 2), 0) / recentFossils.length
    : 0;
  const monthQuality = monthFossils.length > 0
    ? monthFossils.reduce((sum, f) => sum + (f.quality || 2), 0) / monthFossils.length
    : 0;

  if (recentQuality > monthQuality + 0.5 && recentFossils.length >= 3) {
    insights.push({
      type: 'trend',
      icon: Zap,
      title: 'Quality Trending Up',
      message: `Your recent fossils are higher quality than average. You're in the zone!`,
      priority: 4
    });
  }

  return insights.sort((a, b) => a.priority - b.priority);
};

/**
 * ProactiveInsights - Shows intelligent suggestions and patterns
 */
export const ProactiveInsights = ({
  fossils = [],
  kernels = [],
  tokenIndex = new Map(),
  onNavigateToFossil,
  onNavigateToGraph,
  onStartProbe,
  aiConfig,
  onRequestAIInsight,
  compact = false
}) => {
  const [dismissed, setDismissed] = useState(new Set());
  const [expanded, setExpanded] = useState(!compact);
  const [refreshKey, setRefreshKey] = useState(0);

  // Analyze vault for insights (memoized to avoid O(n²) on every render)
  const insights = useMemo(() => {
    // Only recompute when fossils/kernels actually change, not on every render
    return analyzeVault(fossils, tokenIndex, kernels) || [];
  }, [fossils, tokenIndex, kernels, refreshKey]);

  // Filter out dismissed insights
  const activeInsights = insights.filter(i => !dismissed.has(i.title));

  const handleDismiss = (title) => {
    setDismissed(prev => new Set([...prev, title]));
  };

  const handleAction = (insight) => {
    switch (insight.type) {
      case 'pattern':
        // Could navigate to search with topic
        break;
      case 'synthesis':
        onNavigateToGraph?.();
        break;
      case 'bridge':
        onNavigateToFossil?.(insight.fossilId);
        break;
      case 'gap':
        onStartProbe?.();
        break;
      case 'connections':
        onNavigateToGraph?.();
        break;
      default:
        break;
    }
  };

  if (activeInsights.length === 0) return null;

  if (compact) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-950/50 border border-amber-900/50 rounded-lg text-amber-500 hover:bg-amber-950 transition-colors"
      >
        <Lightbulb className="w-4 h-4" />
        <span className="font-mono text-xs">{activeInsights.length} insights</span>
      </button>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 font-bold uppercase tracking-wider">
            Insights
          </span>
          <span className="px-1.5 py-0.5 bg-amber-950/50 rounded text-[10px] text-amber-600 font-mono">
            {activeInsights.length}
          </span>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          title="Refresh insights"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Insights List */}
      <div className="divide-y divide-zinc-800/50">
        {activeInsights.slice(0, 4).map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <div
              key={idx}
              className="group px-4 py-3 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-lg ${
                  insight.type === 'gap' ? 'bg-red-950/50 text-red-500' :
                  insight.type === 'synthesis' ? 'bg-emerald-950/50 text-emerald-500' :
                  insight.type === 'bridge' ? 'bg-purple-950/50 text-purple-500' :
                  'bg-amber-950/50 text-amber-500'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-zinc-400 font-medium">
                    {insight.title}
                  </div>
                  <div className="text-sm text-zinc-500 mt-0.5 leading-relaxed">
                    {insight.message}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAction(insight)}
                    className="p-1 text-zinc-600 hover:text-emerald-500 transition-colors"
                    title="Take action"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDismiss(insight.title)}
                    className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Action */}
      {aiConfig?.apiKey && (
        <div className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-900/30">
          <button
            onClick={onRequestAIInsight}
            className="w-full flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-amber-600/20 to-orange-600/20 hover:from-amber-600/30 hover:to-orange-600/30 border border-amber-600/30 rounded-lg text-amber-500 font-mono text-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Get AI Insight
          </button>
        </div>
      )}
    </div>
  );
};

export default ProactiveInsights;
