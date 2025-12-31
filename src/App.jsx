import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Terminal, Archive, Zap, CheckCircle2, Clock, Search, AlertCircle,
  Trash2, Calendar, Layers, Download, ExternalLink, ArrowRight,
  Database, Star, ChevronUp, Pin, Copy, FastForward, History,
  Target, X, RefreshCw, Brain, GitBranch, Shield, Sparkles,
  RotateCcw, Check, Link2, ZoomIn, ZoomOut, Maximize2, Upload,
  Merge, Plus, Edit3, Flame, TrendingUp, Save, Settings, Eye,
  EyeOff, Loader2, Wand2, MessageSquare, Lightbulb
} from 'lucide-react';

// --- Configuration & Constants ---
const STORAGE_KEY = 'fossil_data_v2.0.0';
const LEGACY_KEYS = [
  'fossil_data_v1.2.5', 'fossil_data_v1.2.4', 'fossil_data_v1.2.3',
  'fossil_data_v1.2.2', 'fossil_data_v1.2.1',
];

const PROBE_TEMPLATES = [
  { label: 'Mechanism Hunt', intent: 'Mechanism Hunt: What mechanism would make [X] inevitable?' },
  { label: 'Invariant Hunt', intent: 'Invariant Hunt: What stays true when [X] scale changes?' },
  { label: 'Feedback Hunt', intent: 'Feedback Hunt: What feedback loop controls [X] behavior?' }
];

// Minimum similarity threshold for re-entry detection
const REENTRY_THRESHOLD = 0.35;
const CONFLICT_THRESHOLD_MIN = 0.25;
const CONFLICT_THRESHOLD_MAX = 0.85;
const SEMANTIC_EDGE_THRESHOLD = 0.30;
const DEBOUNCE_MS = 300;

// Spaced repetition intervals (Fibonacci-like)
const DISMISS_INTERVALS = [1, 2, 3, 5, 8, 13, 21, 34];

// Antonym pairs for conflict detection
const ANTONYM_PAIRS = [
  ['increase', 'decrease'], ['grow', 'shrink'], ['always', 'never'],
  ['more', 'less'], ['better', 'worse'], ['success', 'failure'],
  ['enable', 'prevent'], ['require', 'optional'], ['must', 'should'],
  ['accelerate', 'decelerate'], ['expand', 'contract'], ['simple', 'complex'],
  ['fast', 'slow'], ['high', 'low'], ['start', 'stop'], ['open', 'close']
];

// Negation patterns for conflict detection
const NEGATION_PATTERNS = [
  /\bnot\b/i, /\bnever\b/i, /\bcan't\b/i, /\bcannot\b/i,
  /\bwon't\b/i, /\bisn't\b/i, /\baren't\b/i, /\bwithout\b/i,
  /\bcontrary\b/i, /\bopposite\b/i, /\bfails\b/i, /\bdoesn't\b/i
];

// Graph cluster colors
const CLUSTER_COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];

// --- AI Provider Configuration ---
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', costPer1k: 0.00015 },
      { id: 'gpt-4o', name: 'GPT-4o', costPer1k: 0.0025 },
    ],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    formatRequest: (messages, model) => ({ model, messages, max_tokens: 500 }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || '',
  },
  anthropic: {
    name: 'Anthropic',
    models: [
      { id: 'claude-3-haiku-20240307', name: 'Claude Haiku', costPer1k: 0.00025 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet', costPer1k: 0.003 },
    ],
    baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeader: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }),
    formatRequest: (messages, model) => ({
      model,
      max_tokens: 500,
      messages: messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content }))
    }),
    parseResponse: (data) => data.content?.[0]?.text || '',
  },
  ollama: {
    name: 'Ollama (Local)',
    models: [], // Discovered dynamically
    baseUrl: 'http://localhost:11434/api/chat',
    authHeader: () => ({ 'Content-Type': 'application/json' }),
    formatRequest: (messages, model) => ({ model, messages, stream: false }),
    parseResponse: (data) => data.message?.content || '',
    isLocal: true,
  },
  custom: {
    name: 'Custom Endpoint',
    models: [{ id: 'default', name: 'Default', costPer1k: 0 }],
    baseUrl: '',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    formatRequest: (messages, model) => ({ model, messages, max_tokens: 500 }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || data.content?.[0]?.text || '',
  }
};

// AI Feature Prompts
const AI_PROMPTS = {
  insightSpark: `You are analyzing a personal knowledge vault. Based on this digest, identify ONE non-obvious pattern, tension, or synthesis the user may have missed. Be specific and reference their themes. Max 2 sentences. Be direct, no fluff.`,

  probeSuggestion: `Based on this vault context, suggest ONE thought-provoking probe question that would challenge or extend the user's thinking. Reference specific invariants when possible. Output ONLY the question, nothing else.`,

  conflictAnalysis: `Analyze if the NEW invariant conflicts with existing ones. Consider:
- Direct contradiction
- Hidden tension (both might be true in different contexts)
- Scope limitation (one is subset of other)
Reply with exactly one of: COMPATIBLE | TENSION: [brief explanation] | CONFLICT: [brief explanation]`,

  synthesisHelper: `Synthesize these fossils into ONE meta-invariant (kernel). Capture the underlying principle the user learned this week. Max 2 sentences. Be precise and actionable.`
};

// AI Response Cache (in-memory, cleared on refresh)
const AI_CACHE = new Map();

/**
 * TOKENIZER (Pure Function)
 * Memoization candidate - same input always produces same output
 */
const tokenize = (() => {
  const cache = new Map();
  const MAX_CACHE_SIZE = 1000;
  
  return (s) => {
    if (!s) return new Set();
    if (cache.has(s)) return cache.get(s);
    
    const tokens = new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []));
    
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(s, tokens);
    return tokens;
  };
})();

/**
 * JACCARD SIMILARITY (Pure Function)
 * Optimized with early exit for empty sets
 */
const getJaccard = (a, b) => {
  if (!a?.size || !b?.size) return 0;
  
  let intersection = 0;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  
  for (const x of smaller) {
    if (larger.has(x)) intersection++;
  }
  
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
};

// --- Utility: Core Logic ---
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) 
    return crypto.randomUUID();
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

const getDayKey = (d = new Date()) => {
  try {
    return d.toISOString().split('T')[0];
  } catch (e) {
    return "0000-00-00";
  }
};

const isValidUrl = (s) => {
  try { new URL(s); return true; } catch { return false; }
};

const migrate = (parsed) => {
  const fossils = (parsed?.fossils || []).map(f => ({
    // Original fields with defaults
    quality: 2,
    deleted: false,
    reuseCount: 0,
    // New intelligence fields
    lastRevisitedAt: null,
    dismissedUntil: null,
    reinforceCount: 0,
    dismissCount: 0,
    supersededBy: null,
    supersedes: null,
    coexistsWith: [],
    ...f
  }));
  const kernels = (parsed?.kernels || []).map(k => ({
    nextDirection: '',
    ...k
  }));
  // AI configuration with defaults
  const aiConfig = parsed?.aiConfig || {
    provider: 'openai',
    apiKey: null,
    model: 'gpt-4o-mini',
    customEndpoint: null,
    enabled: false,
    features: {
      insightSpark: true,
      probeSuggestion: true,
      conflictAnalysis: false,
      synthesisHelper: true
    },
    dailySpend: 0,
    dailySpendDate: null,
    dailyCap: 0.10
  };
  return {
    fossils,
    kernels,
    activeKernelId: parsed?.activeKernelId || null,
    activeProbe: parsed?.activeProbe || null,
    aiConfig,
    vaultDigest: parsed?.vaultDigest || null
  };
};

// --- Intelligence Algorithms ---

/**
 * Calculate decay score for a fossil (higher = more urgent to resurface)
 */
const calculateDecayScore = (fossil, allFossils) => {
  const now = Date.now();
  const createdAt = new Date(fossil.createdAt).getTime();
  const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);

  // Skip very recent fossils (< 7 days old)
  if (daysSinceCreation < 7) return -999;

  // Age factor: older fossils need review
  const ageFactor = Math.log(daysSinceCreation + 1) / 10;

  // Isolation: fossils not connected to others decay faster
  const hasChildren = allFossils.some(f => f.reentryOf === fossil.id && !f.deleted);
  const isolationFactor = hasChildren ? 0 : 0.3;

  // Last revisit: longer since revisit = higher decay
  const lastRevisit = fossil.lastRevisitedAt
    ? new Date(fossil.lastRevisitedAt).getTime()
    : createdAt;
  const daysSinceRevisit = (now - lastRevisit) / (1000 * 60 * 60 * 24);
  const revisitFactor = Math.log(daysSinceRevisit + 1) / 8;

  // Quality bonus (higher quality = less urgent)
  const qualityBonus = ((fossil.quality || 2) - 2) * 0.2;

  // Reuse bonus (frequently reused = still active)
  const reuseBonus = Math.min((fossil.reuseCount || 0) * 0.1, 0.5);

  // Reinforcement bonus (user explicitly valued this)
  const reinforceBonus = (fossil.reinforceCount || 0) * 0.15;

  return ageFactor + isolationFactor + revisitFactor - qualityBonus - reuseBonus - reinforceBonus;
};

/**
 * Select a fossil for resurfacing using weighted random from top candidates
 */
const selectResurfaceFossil = (fossils, todayKey) => {
  const now = new Date();
  const eligible = fossils.filter(f =>
    !f.deleted &&
    f.dayKey !== todayKey &&
    (!f.dismissedUntil || new Date(f.dismissedUntil) <= now) &&
    !f.supersededBy // Don't resurface superseded fossils
  );

  if (eligible.length === 0) return null;

  // Score all fossils
  const scored = eligible.map(f => ({
    fossil: f,
    score: calculateDecayScore(f, fossils)
  })).filter(s => s.score > -900); // Filter out too recent

  if (scored.length === 0) return null;

  // Get top 5 candidates
  const sorted = scored.sort((a, b) => b.score - a.score);
  const top5 = sorted.slice(0, 5);

  // Weighted random selection
  const totalWeight = top5.reduce((sum, s) => sum + Math.exp(s.score), 0);
  let random = Math.random() * totalWeight;

  for (const item of top5) {
    random -= Math.exp(item.score);
    if (random <= 0) return item.fossil;
  }

  return top5[0]?.fossil || null;
};

/**
 * Get next dismiss date based on dismiss count
 */
const getNextDismissDate = (dismissCount) => {
  const days = DISMISS_INTERVALS[Math.min(dismissCount, DISMISS_INTERVALS.length - 1)];
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

/**
 * Detect semantic opposition between two texts
 */
const detectSemanticOpposition = (textA, textB) => {
  const tokensA = textA.toLowerCase().split(/\s+/);
  const tokensB = textB.toLowerCase().split(/\s+/);
  const oppositions = [];

  for (const [wordA, wordB] of ANTONYM_PAIRS) {
    if ((tokensA.includes(wordA) && tokensB.includes(wordB)) ||
        (tokensA.includes(wordB) && tokensB.includes(wordA))) {
      oppositions.push([wordA, wordB]);
    }
  }

  return oppositions;
};

/**
 * Detect conflicts between a new invariant and existing fossils
 */
const detectConflicts = (newInvariant, existingFossils, tokenIndex) => {
  const conflicts = [];
  const newTokens = tokenize(newInvariant);
  const newHasNegation = NEGATION_PATTERNS.some(p => p.test(newInvariant));

  for (const fossil of existingFossils) {
    if (fossil.deleted || fossil.supersededBy) continue;

    const existingTokens = tokenIndex.get(fossil.id) || tokenize(fossil.invariant || '');
    const similarity = getJaccard(newTokens, existingTokens);

    // Check if in conflict range (similar enough to compare, different enough to conflict)
    if (similarity >= CONFLICT_THRESHOLD_MIN && similarity < CONFLICT_THRESHOLD_MAX) {
      const existingHasNegation = NEGATION_PATTERNS.some(p => p.test(fossil.invariant || ''));
      const negationConflict = newHasNegation !== existingHasNegation;
      const oppositions = detectSemanticOpposition(newInvariant, fossil.invariant || '');

      if (negationConflict || oppositions.length > 0) {
        conflicts.push({
          fossil,
          similarity: Math.round(similarity * 100),
          reason: negationConflict ? 'negation' : 'semantic',
          oppositions
        });
      }
    }
  }

  return conflicts.sort((a, b) => b.similarity - a.similarity);
};

/**
 * Build graph data from fossils
 */
const buildGraphData = (fossils, tokenIndex) => {
  const nodes = [];
  const edges = [];
  const visibleFossils = fossils.filter(f => !f.deleted);

  // Build nodes
  for (const fossil of visibleFossils) {
    nodes.push({
      id: fossil.id,
      size: 8 + ((fossil.quality || 2) * 4) + ((fossil.reuseCount || 0) * 2),
      label: (fossil.invariant || '').slice(0, 35) + ((fossil.invariant || '').length > 35 ? '...' : ''),
      fossil,
      cluster: 0
    });
  }

  // Build edges
  for (let i = 0; i < visibleFossils.length; i++) {
    const fA = visibleFossils[i];

    // Reentry edges (explicit connections)
    if (fA.reentryOf) {
      const parentExists = visibleFossils.some(f => f.id === fA.reentryOf);
      if (parentExists) {
        edges.push({
          source: fA.id,
          target: fA.reentryOf,
          type: 'reentry',
          weight: 1.0
        });
      }
    }

    // Semantic edges (implicit connections)
    const tokensA = tokenIndex.get(fA.id);
    for (let j = i + 1; j < visibleFossils.length; j++) {
      const fB = visibleFossils[j];
      if (fA.reentryOf === fB.id || fB.reentryOf === fA.id) continue;

      const tokensB = tokenIndex.get(fB.id);
      const similarity = getJaccard(tokensA, tokensB);

      if (similarity >= SEMANTIC_EDGE_THRESHOLD) {
        edges.push({
          source: fA.id,
          target: fB.id,
          type: 'semantic',
          weight: similarity
        });
      }
    }
  }

  // Assign clusters using connected components
  const visited = new Set();
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const adjacency = new Map();

  edges.forEach(e => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source).push(e.target);
    adjacency.get(e.target).push(e.source);
  });

  let clusterIdx = 0;
  const dfs = (nodeId, cluster) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    if (nodeMap[nodeId]) nodeMap[nodeId].cluster = cluster;
    (adjacency.get(nodeId) || []).forEach(neighbor => dfs(neighbor, cluster));
  };

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      dfs(node.id, clusterIdx);
      clusterIdx++;
    }
  });

  return { nodes, edges, clusterCount: clusterIdx };
};

/**
 * Force-directed layout algorithm
 */
const layoutGraph = (nodes, edges, width = 600, height = 400, iterations = 80) => {
  if (nodes.length === 0) return nodes;

  // Initialize positions
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = Math.min(width, height) * 0.35;
    node.x = width / 2 + radius * Math.cos(angle);
    node.y = height / 2 + radius * Math.sin(angle);
  });

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;

    // Repulsion between all nodes
    for (const nodeA of nodes) {
      let fx = 0, fy = 0;
      for (const nodeB of nodes) {
        if (nodeA.id === nodeB.id) continue;

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 800 / (dist * dist);

        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      nodeA.vx = (nodeA.vx || 0) + fx * temperature;
      nodeA.vy = (nodeA.vy || 0) + fy * temperature;
    }

    // Attraction along edges
    for (const edge of edges) {
      const nodeA = nodeMap[edge.source];
      const nodeB = nodeMap[edge.target];
      if (!nodeA || !nodeB) continue;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = dist * 0.02 * edge.weight;

      nodeA.vx = (nodeA.vx || 0) + (dx / dist) * force * temperature;
      nodeA.vy = (nodeA.vy || 0) + (dy / dist) * force * temperature;
      nodeB.vx = (nodeB.vx || 0) - (dx / dist) * force * temperature;
      nodeB.vy = (nodeB.vy || 0) - (dy / dist) * force * temperature;
    }

    // Apply velocities with damping
    nodes.forEach(node => {
      node.x += (node.vx || 0) * 0.1;
      node.y += (node.vy || 0) * 0.1;
      node.vx = (node.vx || 0) * 0.8;
      node.vy = (node.vy || 0) * 0.8;
    });
  }

  // Normalize to viewport with padding
  const padding = 40;
  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));

  const scaleX = (maxX - minX) > 0 ? (width - padding * 2) / (maxX - minX) : 1;
  const scaleY = (maxY - minY) > 0 ? (height - padding * 2) / (maxY - minY) : 1;
  const scale = Math.min(scaleX, scaleY, 1);

  nodes.forEach(node => {
    node.x = padding + (node.x - minX) * scale;
    node.y = padding + (node.y - minY) * scale;
    delete node.vx;
    delete node.vy;
  });

  return nodes;
};

/**
 * Calculate current streak and stats
 */
const calculateStreak = (fossils) => {
  const validFossils = fossils.filter(f => !f.deleted);
  if (validFossils.length === 0) return { current: 0, longest: 0, total: 0, gaps: [] };

  // Get all unique day keys sorted descending
  const dayKeys = [...new Set(validFossils.map(f => f.dayKey))].sort().reverse();
  const today = getDayKey();

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const gaps = [];

  // Check if today or yesterday has a fossil (streak is active)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDayKey(yesterday);

  const hasToday = dayKeys.includes(today);
  const hasYesterday = dayKeys.includes(yesterdayKey);

  if (hasToday || hasYesterday) {
    // Count current streak backwards
    let checkDate = hasToday ? new Date() : yesterday;
    while (true) {
      const key = getDayKey(checkDate);
      if (dayKeys.includes(key)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak and find gaps
  let prevDate = null;
  for (const dayKey of dayKeys.slice().reverse()) {
    const date = new Date(dayKey);
    if (prevDate) {
      const diff = Math.floor((date - prevDate) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        tempStreak++;
      } else {
        if (diff > 1) {
          gaps.push({ from: getDayKey(prevDate), to: dayKey, days: diff - 1 });
        }
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    prevDate = date;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    current: currentStreak,
    longest: longestStreak,
    total: validFossils.length,
    gaps: gaps.slice(0, 5) // Last 5 gaps
  };
};

/**
 * Export full vault data as JSON
 */
const exportVaultJSON = (data) => {
  const exportData = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    ...data
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fossil-vault-${getDayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Validate imported data structure
 */
const validateImportData = (data) => {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid JSON structure' };
  if (!Array.isArray(data.fossils)) return { valid: false, error: 'Missing fossils array' };
  if (!Array.isArray(data.kernels)) return { valid: false, error: 'Missing kernels array' };

  // Basic fossil validation
  for (const fossil of data.fossils) {
    if (!fossil.id || !fossil.invariant) {
      return { valid: false, error: 'Invalid fossil structure (missing id or invariant)' };
    }
  }

  return { valid: true };
};

// --- AI Integration Functions ---

/**
 * Build a compressed vault digest for AI context (~400 tokens)
 * This is the key cost-saving innovation - gives AI full visibility cheaply
 */
const buildVaultDigest = (fossils) => {
  const validFossils = fossils.filter(f => !f.deleted);
  if (validFossils.length === 0) {
    return 'VAULT: Empty - no fossils yet.';
  }

  // Sort by date
  const sorted = [...validFossils].sort((a, b) =>
    new Date(a.createdAt) - new Date(b.createdAt)
  );
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  // Extract themes using TF-IDF-like approach (word frequency)
  const wordFreq = new Map();
  validFossils.forEach(f => {
    const words = tokenize(f.invariant);
    words.forEach(word => {
      if (word.length > 3) { // Skip short words
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });
  });
  const themes = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  // Get top quality fossils
  const topByQuality = [...validFossils]
    .sort((a, b) => (b.quality || 2) - (a.quality || 2))
    .slice(0, 5)
    .map(f => f.invariant.slice(0, 80) + (f.invariant.length > 80 ? '...' : ''));

  // Get most reused fossils (active chains)
  const activeChains = [...validFossils]
    .sort((a, b) => (b.reuseCount || 0) - (a.reuseCount || 0))
    .slice(0, 3)
    .filter(f => (f.reuseCount || 0) > 0)
    .map(f => `${f.invariant.slice(0, 50)}... (reused ${f.reuseCount}x)`);

  // Recent fossils
  const recent = sorted.slice(-3).map(f =>
    `[${f.dayKey}] ${f.invariant.slice(0, 60)}${f.invariant.length > 60 ? '...' : ''}`
  );

  // Build digest string
  return `VAULT DIGEST
Stats: ${validFossils.length} fossils | ${oldest.dayKey} to ${newest.dayKey}
Themes: ${themes.join(', ') || 'none yet'}

TOP INVARIANTS:
${topByQuality.map((inv, i) => `${i + 1}. ${inv}`).join('\n')}

${activeChains.length > 0 ? `ACTIVE CHAINS:\n${activeChains.join('\n')}` : ''}

RECENT:
${recent.join('\n')}`;
};

/**
 * Get context for a specific fossil (for conflict analysis)
 */
const getFossilContext = (fossil) => {
  return `FOSSIL [${fossil.dayKey}]:
Probe: ${fossil.probeIntent}
Invariant: ${fossil.invariant}
Model Shift: ${fossil.modelShift || 'none'}
Quality: ${fossil.quality}/5`;
};

/**
 * Simple hash for cache keys
 */
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

/**
 * Call AI with caching and provider adaptation
 */
const callAI = async (aiConfig, systemPrompt, userContent) => {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error('Invalid AI provider');

  // Check cache first
  const cacheKey = hashString(systemPrompt + userContent + aiConfig.model);
  const cached = AI_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < 3600000) { // 1 hour TTL
    return { response: cached.response, fromCache: true, cost: 0 };
  }

  // Build request
  const baseUrl = aiConfig.provider === 'custom' ? aiConfig.customEndpoint : provider.baseUrl;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const body = provider.formatRequest(messages, aiConfig.model);
  const headers = provider.authHeader(aiConfig.apiKey);

  // Make request
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`AI request failed: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const response = provider.parseResponse(data);

  // Estimate cost (rough approximation)
  const model = provider.models.find(m => m.id === aiConfig.model);
  const tokens = Math.ceil((systemPrompt.length + userContent.length + response.length) / 4);
  const cost = model ? (tokens / 1000) * model.costPer1k : 0;

  // Cache response
  AI_CACHE.set(cacheKey, { response, at: Date.now() });

  return { response, fromCache: false, cost };
};

/**
 * Discover Ollama models
 */
const discoverOllamaModels = async () => {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => ({
      id: m.name,
      name: m.name,
      costPer1k: 0
    }));
  } catch {
    return [];
  }
};

/**
 * Test AI connection
 */
const testAIConnection = async (aiConfig) => {
  try {
    const result = await callAI(
      aiConfig,
      'Reply with exactly: OK',
      'Test connection'
    );
    return result.response.includes('OK') ? { success: true } : { success: true, warning: 'Unexpected response' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const loadData = () => {
  try {
    let saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) {
          saved = legacy;
          break;
        }
      }
    }

    const parsed = saved ? JSON.parse(saved) : null;
    const migrated = migrate(parsed);
    
    // Day-lock the persisted probe
    if (migrated.activeProbe && 
        getDayKey(new Date(migrated.activeProbe.startTime)) !== getDayKey()) {
      migrated.activeProbe = null;
    }
    return migrated;
  } catch (e) {
    console.error('Load failed:', e);
    return { fossils: [], kernels: [], activeKernelId: null, activeProbe: null };
  }
};

const saveData = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Save failed", e);
  }
};

// --- Debounce Hook ---
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// --- Main App ---
const App = () => {
  const [data, setData] = useState(() => loadData());
  const [view, setView] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusChainIds, setFocusChainIds] = useState(null); 
  const [now, setNow] = useState(Date.now());
  const [mode, setMode] = useState('standard'); 
  
  const [kernelInProgress, setKernelInProgress] = useState({ 
    invariant: '', 
    counterpoint: '', 
    nextDirection: '' 
  });

  // Form State
  const [intent, setIntent] = useState('');
  const [reentryWarning, setReentryWarning] = useState(null);
  const [compression, setCompression] = useState({
    primitives: ['', '', ''],
    quickPrimitives: '', 
    invariant: '',
    modelShift: '',
    quality: 2
  });
  const [fossilType, setFossilType] = useState('Note');
  const [payload, setPayload] = useState('');

  // Intelligence state
  const [resurfaceFossil, setResurfaceFossil] = useState(null);
  const [pendingConflicts, setPendingConflicts] = useState([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [graphZoom, setGraphZoom] = useState(1);

  // Graph interaction state
  const [graphMode, setGraphMode] = useState('view'); // 'view' | 'connect' | 'merge'
  const [connectSource, setConnectSource] = useState(null);
  const [mergeTargets, setMergeTargets] = useState([]);
  const [manualEdges, setManualEdges] = useState([]); // User-created connections
  const [nodeAnnotations, setNodeAnnotations] = useState({}); // id -> annotation
  const [editingAnnotation, setEditingAnnotation] = useState(null);

  // Import state
  const fileInputRef = useRef(null);

  // AI state
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null); // { type, content, action? }
  const [aiError, setAiError] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [aiTestStatus, setAiTestStatus] = useState(null); // { success, error?, warning? }

  // Debounced intent for re-entry detection
  const debouncedIntent = useDebounce(intent, DEBOUNCE_MS);

  // Refs for cleanup
  const timerRef = useRef(null);

  // Persistence
  useEffect(() => {
    saveData(data);
  }, [data]);

  // UI Cleanup: Clear chain view on tab switch
  useEffect(() => {
    if (view !== 'fossils' && focusChainIds) {
      setFocusChainIds(null);
    }
  }, [view, focusChainIds]);

  // UX Safety: Quick mode isn't for Links
  useEffect(() => {
    if (mode === 'quick' && fossilType === 'Link') {
      setFossilType('Note');
    }
  }, [mode, fossilType]);

  // Timer loop with proper cleanup
  useEffect(() => {
    if (data.activeProbe) {
      timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [data.activeProbe]);

  // --- Intelligence Engine ---
  
  const fossilMap = useMemo(() => 
    Object.fromEntries((data.fossils || []).map(f => [f.id, f])), 
  [data.fossils]);

  const visibleFossils = useMemo(() => 
    (data.fossils || []).filter(f => !f.deleted), 
  [data.fossils]);

  /**
   * Stable Token Index
   * Only recomputes when fossils actually change
   */
  const fossilTokenIndex = useMemo(() => {
    const index = new Map();
    for (const f of visibleFossils) {
      const composite = `${f.probeIntent || ''} ${f.invariant || ''}`;
      index.set(f.id, tokenize(composite));
    }
    return index;
  }, [visibleFossils]);

  const activeKernel = useMemo(() => 
    (data.kernels || []).find(k => k.id === data.activeKernelId),
  [data.kernels, data.activeKernelId]);

  const todayKey = getDayKey();
  const todayFossil = useMemo(() =>
    visibleFossils.find(f => f.dayKey === todayKey),
  [visibleFossils, todayKey]);

  // Compute streak stats
  const streakStats = useMemo(() =>
    calculateStreak(data.fossils || []),
  [data.fossils]);

  // Harvest view data
  const last7DaysFossils = useMemo(() => visibleFossils.filter(f => {
    const ts = new Date(f.createdAt || f.date).getTime();
    return !isNaN(ts) && (Date.now() - ts < 7 * 24 * 60 * 60 * 1000);
  }), [visibleFossils]);

  const rankedCandidates = useMemo(() => {
    return last7DaysFossils.map(f => {
      let score = (f.quality || 2) * 2;
      score += (f.reuseCount || 0) * 3;
      return { ...f, score };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [last7DaysFossils]);

  const sealKernel = useCallback(() => {
    const id = generateId();
    const newKernel = {
      id,
      date: new Date().toISOString(),
      ...kernelInProgress,
      fossilIds: last7DaysFossils.map(f => f.id)
    };
    setData(prev => ({
      ...prev,
      kernels: [newKernel, ...prev.kernels],
      activeKernelId: id
    }));
    setKernelInProgress({
      invariant: '',
      counterpoint: '',
      nextDirection: ''
    });
  }, [kernelInProgress, last7DaysFossils]);

  // Compute graph data (lazy - only when on graph view)
  const graphData = useMemo(() => {
    if (view !== 'graph') return null;
    const graphResult = buildGraphData(visibleFossils, fossilTokenIndex);

    // Add manual edges
    manualEdges.forEach(edge => {
      const sourceExists = graphResult.nodes.some(n => n.id === edge.source);
      const targetExists = graphResult.nodes.some(n => n.id === edge.target);
      if (sourceExists && targetExists) {
        graphResult.edges.push({
          source: edge.source,
          target: edge.target,
          type: 'manual',
          weight: 0.8,
          label: edge.label
        });
      }
    });

    layoutGraph(graphResult.nodes, graphResult.edges, 600, 400);
    return graphResult;
  }, [view, visibleFossils, fossilTokenIndex, manualEdges]);

  // Compute resurface fossil on mount and when fossils change
  useEffect(() => {
    if (!todayFossil && !data.activeProbe && visibleFossils.length > 0) {
      const candidate = selectResurfaceFossil(data.fossils, todayKey);
      setResurfaceFossil(candidate);
    } else {
      setResurfaceFossil(null);
    }
  }, [data.fossils, data.activeProbe, todayFossil, todayKey, visibleFossils.length]);

  const getTrail = useCallback((f) => {
    const trail = [];
    let cur = f;
    const seen = new Set();
    while (cur?.reentryOf && fossilMap[cur.reentryOf] && !seen.has(cur.reentryOf)) {
      seen.add(cur.reentryOf);
      cur = fossilMap[cur.reentryOf];
      trail.push(cur);
    }
    return trail;
  }, [fossilMap]);

  const handleDrillDown = useCallback((f) => {
    const trail = getTrail(f);
    const orderedIds = [f.id, ...trail.map(t => t.id)];
    setFocusChainIds(orderedIds);
    setSearchQuery(''); 
    setView('fossils');
  }, [getTrail]);

  /**
   * Optimized Re-entry Detection
   * - Uses debounced input
   * - Pre-filters by length
   * - Early exit when match found
   */
  const detectReentry = useCallback((queryText) => {
    const v = (queryText || '').trim();
    if (v.length < 5) return null;

    const vLower = v.toLowerCase();
    const vTokens = tokenize(v);
    
    let bestMatch = null;
    let maxScore = 0;

    for (const f of visibleFossils) {
      const piLower = (f.probeIntent || '').toLowerCase();
      
      const sim = getJaccard(vTokens, fossilTokenIndex.get(f.id) || new Set());
      
      const sub = (vLower.length >= 12 && piLower.length >= 12) && 
                  (piLower.includes(vLower) || vLower.includes(piLower)) 
                  ? 0.9 : 0;
      
      const score = Math.max(sim, sub);
      
      if (score > maxScore) {
        maxScore = score;
        bestMatch = f;
      }

      // Early exit if we found a near-perfect match
      if (score > 0.9) break;
    }

    return maxScore >= REENTRY_THRESHOLD ? bestMatch : null;
  }, [visibleFossils, fossilTokenIndex]);

  // Effect for debounced re-entry detection
  useEffect(() => {
    const warning = detectReentry(debouncedIntent);
    setReentryWarning(warning);
  }, [debouncedIntent, detectReentry]);

  const primitivesOk = mode === 'quick' 
    ? (compression.quickPrimitives || '').trim().length > 0 
    : compression.primitives.every(p => (p || '').trim().length > 0);
  
  const payloadOk = fossilType !== 'Link' || (payload || '').trim().length > 0;
  const linkOk = fossilType !== 'Link' || isValidUrl((payload || '').trim());
  
  const canSeal = primitivesOk && 
                  compression.invariant?.trim() && 
                  (mode === 'quick' || compression.modelShift?.trim()) && 
                  payloadOk && 
                  linkOk &&
                  !todayFossil;

  const sealFossil = useCallback(() => {
    if (!canSeal) return;

    const finalPrimitives = mode === 'quick'
      ? compression.quickPrimitives.split('\n')
          .map(p => p.trim())
          .filter(Boolean)
          .slice(0, 3)
      : compression.primitives.map(p => (p || '').trim());

    const newFossil = {
      id: generateId(),
      dayKey: todayKey,
      createdAt: new Date().toISOString(),
      probeIntent: (data.activeProbe?.intent || intent || '').trim(),
      primitives: finalPrimitives,
      invariant: compression.invariant.trim(),
      modelShift: mode === 'quick' 
        ? 'Quick Mode Closure.' 
        : compression.modelShift.trim(),
      quality: mode === 'quick' ? 1 : compression.quality,
      artifactType: fossilType,
      payload: (payload || '').trim(),
      reentryOf: data.activeProbe?.reentryOf || reentryWarning?.id || null,
      duration: data.activeProbe 
        ? Math.floor((Date.now() - data.activeProbe.startTime) / 1000) 
        : 0,
      deleted: false,
      reuseCount: 0
    };

    setData(prev => {
      const updatedFossils = [newFossil, ...prev.fossils].map(f =>
        f.id === newFossil.reentryOf 
          ? { ...f, reuseCount: (f.reuseCount || 0) + 1 } 
          : f
      );
      return { ...prev, fossils: updatedFossils, activeProbe: null };
    });
    
    setIntent('');
    setCompression({ 
      primitives: ['', '', ''], 
      quickPrimitives: '', 
      invariant: '', 
      modelShift: '', 
      quality: 2 
    });
    setPayload('');
    setMode('standard');
  }, [canSeal, mode, compression, fossilType, payload, todayKey, 
      data.activeProbe, intent, reentryWarning]);

  const deleteFossil = useCallback((id) => {
    if (window.confirm("Soft delete this fossil? Archive integrity is maintained.")) {
      setData(prev => ({
        ...prev,
        fossils: prev.fossils.map(f =>
          f.id === id ? { ...f, deleted: true } : f
        )
      }));
    }
  }, []);

  // --- Resurface Handlers ---

  const handleResurfaceDismiss = useCallback(() => {
    if (!resurfaceFossil) return;
    const nextDate = getNextDismissDate(resurfaceFossil.dismissCount || 0);
    setData(prev => ({
      ...prev,
      fossils: prev.fossils.map(f =>
        f.id === resurfaceFossil.id
          ? { ...f, dismissedUntil: nextDate, dismissCount: (f.dismissCount || 0) + 1 }
          : f
      )
    }));
    setResurfaceFossil(null);
  }, [resurfaceFossil]);

  const handleResurfaceChallenge = useCallback(() => {
    if (!resurfaceFossil) return;
    setIntent(`Re-examine: ${resurfaceFossil.probeIntent}`);
    setData(prev => ({
      ...prev,
      fossils: prev.fossils.map(f =>
        f.id === resurfaceFossil.id
          ? { ...f, lastRevisitedAt: new Date().toISOString() }
          : f
      ),
      activeProbe: {
        intent: `Re-examine: ${resurfaceFossil.probeIntent}`,
        startTime: Date.now(),
        reentryOf: resurfaceFossil.id
      }
    }));
    setResurfaceFossil(null);
  }, [resurfaceFossil]);

  const handleResurfaceReinforce = useCallback(() => {
    if (!resurfaceFossil) return;
    setData(prev => ({
      ...prev,
      fossils: prev.fossils.map(f =>
        f.id === resurfaceFossil.id
          ? {
              ...f,
              reinforceCount: (f.reinforceCount || 0) + 1,
              lastRevisitedAt: new Date().toISOString()
            }
          : f
      )
    }));
    setResurfaceFossil(null);
  }, [resurfaceFossil]);

  // --- Conflict Handlers ---

  const checkForConflicts = useCallback(() => {
    if (!compression.invariant?.trim()) return [];
    return detectConflicts(compression.invariant, visibleFossils, fossilTokenIndex);
  }, [compression.invariant, visibleFossils, fossilTokenIndex]);

  const handleConflictSupersede = useCallback((conflictFossilId) => {
    // Mark old fossil as superseded, new fossil supersedes it
    setPendingConflicts(prev => prev.filter(c => c.fossil.id !== conflictFossilId));
    // Store for when we seal
    setData(prev => ({
      ...prev,
      fossils: prev.fossils.map(f =>
        f.id === conflictFossilId
          ? { ...f, supersededBy: 'pending' } // Will be updated with actual ID on seal
          : f
      )
    }));
  }, []);

  const handleConflictCoexist = useCallback((conflictFossilId) => {
    // Mark as compatible tension
    setPendingConflicts(prev => prev.filter(c => c.fossil.id !== conflictFossilId));
  }, []);

  const handleSealWithConflictCheck = useCallback(() => {
    const conflicts = checkForConflicts();
    if (conflicts.length > 0) {
      setPendingConflicts(conflicts);
      setShowConflictModal(true);
    } else {
      sealFossil();
    }
  }, [checkForConflicts, sealFossil]);

  const handleForceSeal = useCallback(() => {
    setShowConflictModal(false);
    setPendingConflicts([]);
    sealFossil();
  }, [sealFossil]);

  // --- Import/Export Handlers ---

  const handleExportJSON = useCallback(() => {
    exportVaultJSON(data);
  }, [data]);

  const handleImportJSON = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        const validation = validateImportData(importedData);

        if (!validation.valid) {
          alert(`Import failed: ${validation.error}`);
          return;
        }

        const mergeChoice = window.confirm(
          `Import ${importedData.fossils.length} fossils and ${importedData.kernels.length} kernels?\n\n` +
          `Click OK to MERGE with existing data.\n` +
          `Click Cancel to REPLACE all data.`
        );

        if (mergeChoice) {
          // Merge: add new fossils/kernels, skip duplicates by ID
          const existingFossilIds = new Set(data.fossils.map(f => f.id));
          const existingKernelIds = new Set(data.kernels.map(k => k.id));

          const newFossils = importedData.fossils.filter(f => !existingFossilIds.has(f.id));
          const newKernels = importedData.kernels.filter(k => !existingKernelIds.has(k.id));

          setData(prev => ({
            ...prev,
            fossils: [...prev.fossils, ...newFossils.map(f => migrate({ fossils: [f] }).fossils[0])],
            kernels: [...prev.kernels, ...newKernels]
          }));

          alert(`Merged: ${newFossils.length} new fossils, ${newKernels.length} new kernels.`);
        } else {
          // Replace: overwrite everything
          const migratedData = migrate(importedData);
          setData(migratedData);
          alert(`Replaced: ${migratedData.fossils.length} fossils, ${migratedData.kernels.length} kernels.`);
        }
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
  }, [data]);

  // --- Graph Interaction Handlers ---

  const handleGraphNodeClick = useCallback((nodeId) => {
    if (graphMode === 'view') {
      setSelectedGraphNode(selectedGraphNode === nodeId ? null : nodeId);
    } else if (graphMode === 'connect') {
      if (!connectSource) {
        setConnectSource(nodeId);
      } else if (connectSource !== nodeId) {
        // Create connection
        const label = window.prompt('Connection label (optional):') || '';
        setManualEdges(prev => [...prev, {
          id: generateId(),
          source: connectSource,
          target: nodeId,
          label
        }]);
        setConnectSource(null);
        setGraphMode('view');
      }
    } else if (graphMode === 'merge') {
      setMergeTargets(prev =>
        prev.includes(nodeId)
          ? prev.filter(id => id !== nodeId)
          : prev.length < 3 ? [...prev, nodeId] : prev
      );
    }
  }, [graphMode, selectedGraphNode, connectSource]);

  const handleMergeFossils = useCallback(() => {
    if (mergeTargets.length < 2) {
      alert('Select at least 2 fossils to merge.');
      return;
    }

    const fossilsToMerge = mergeTargets.map(id => fossilMap[id]).filter(Boolean);
    if (fossilsToMerge.length < 2) return;

    // Sort by date, newest first
    fossilsToMerge.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Create merged fossil
    const merged = {
      id: generateId(),
      dayKey: getDayKey(),
      createdAt: new Date().toISOString(),
      probeIntent: `[MERGED] ${fossilsToMerge.map(f => f.probeIntent).join(' + ')}`,
      primitives: [...new Set(fossilsToMerge.flatMap(f => f.primitives || []))].slice(0, 5),
      invariant: fossilsToMerge.map(f => f.invariant).join(' → '),
      modelShift: 'Merged from multiple fossils.',
      quality: Math.max(...fossilsToMerge.map(f => f.quality || 2)),
      artifactType: 'Note',
      payload: fossilsToMerge.map(f => `[${f.dayKey}] ${f.invariant}`).join('\n\n'),
      reentryOf: fossilsToMerge[0].id,
      duration: 0,
      deleted: false,
      reuseCount: fossilsToMerge.reduce((sum, f) => sum + (f.reuseCount || 0), 0),
      reinforceCount: 0,
      lastRevisitedAt: null,
      dismissedUntil: null,
      dismissCount: 0,
      supersededBy: null,
      supersedes: null,
      coexistsWith: []
    };

    // Mark original fossils as superseded
    setData(prev => ({
      ...prev,
      fossils: [
        merged,
        ...prev.fossils.map(f =>
          mergeTargets.includes(f.id)
            ? { ...f, supersededBy: merged.id }
            : f
        )
      ]
    }));

    setMergeTargets([]);
    setGraphMode('view');
    setSelectedGraphNode(merged.id);
  }, [mergeTargets, fossilMap]);

  const handleAddAnnotation = useCallback((nodeId, text) => {
    setNodeAnnotations(prev => ({
      ...prev,
      [nodeId]: text
    }));
    setEditingAnnotation(null);
  }, []);

  const handleRemoveManualEdge = useCallback((edgeId) => {
    setManualEdges(prev => prev.filter(e => e.id !== edgeId));
  }, []);

  // --- AI Handlers ---

  const updateAIConfig = useCallback((updates) => {
    setData(prev => ({
      ...prev,
      aiConfig: { ...prev.aiConfig, ...updates }
    }));
  }, []);

  const handleAIInsightSpark = useCallback(async () => {
    if (!data.aiConfig?.enabled || !data.aiConfig?.apiKey) {
      setShowAISettings(true);
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const digest = buildVaultDigest(data.fossils);
      const result = await callAI(
        data.aiConfig,
        AI_PROMPTS.insightSpark,
        digest
      );

      // Track spending
      if (!result.fromCache) {
        const today = getDayKey();
        const newSpend = (data.aiConfig.dailySpendDate === today ? data.aiConfig.dailySpend : 0) + result.cost;
        updateAIConfig({ dailySpend: newSpend, dailySpendDate: today });
      }

      setAiResponse({
        type: 'insight',
        content: result.response,
        fromCache: result.fromCache,
        cost: result.cost
      });
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }, [data.aiConfig, data.fossils, updateAIConfig]);

  const handleAIProbeSuggestion = useCallback(async () => {
    if (!data.aiConfig?.enabled || !data.aiConfig?.apiKey) {
      setShowAISettings(true);
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const digest = buildVaultDigest(data.fossils);
      const recent = visibleFossils.slice(-3).map(f => getFossilContext(f)).join('\n\n');
      const context = `${digest}\n\nRECENT FOSSILS:\n${recent}`;

      const result = await callAI(
        data.aiConfig,
        AI_PROMPTS.probeSuggestion,
        context
      );

      if (!result.fromCache) {
        const today = getDayKey();
        const newSpend = (data.aiConfig.dailySpendDate === today ? data.aiConfig.dailySpend : 0) + result.cost;
        updateAIConfig({ dailySpend: newSpend, dailySpendDate: today });
      }

      setAiResponse({
        type: 'probe',
        content: result.response,
        fromCache: result.fromCache,
        cost: result.cost
      });
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }, [data.aiConfig, data.fossils, visibleFossils, updateAIConfig]);

  const handleAISynthesis = useCallback(async (weekFossils) => {
    if (!data.aiConfig?.enabled || !data.aiConfig?.apiKey) {
      setShowAISettings(true);
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const digest = buildVaultDigest(data.fossils);
      const weekContext = weekFossils.map(f => getFossilContext(f)).join('\n\n');
      const context = `${digest}\n\nTHIS WEEK'S FOSSILS:\n${weekContext}`;

      const result = await callAI(
        data.aiConfig,
        AI_PROMPTS.synthesisHelper,
        context
      );

      if (!result.fromCache) {
        const today = getDayKey();
        const newSpend = (data.aiConfig.dailySpendDate === today ? data.aiConfig.dailySpend : 0) + result.cost;
        updateAIConfig({ dailySpend: newSpend, dailySpendDate: today });
      }

      setAiResponse({
        type: 'synthesis',
        content: result.response,
        fromCache: result.fromCache,
        cost: result.cost
      });
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }, [data.aiConfig, data.fossils, updateAIConfig]);

  const handleAIConflictCheck = useCallback(async (newFossil, similarFossils) => {
    if (!data.aiConfig?.enabled || !data.aiConfig?.features?.conflictAnalysis) {
      return null;
    }

    try {
      const digest = buildVaultDigest(data.fossils);
      const newContext = getFossilContext(newFossil);
      const similarContext = similarFossils.map(f => getFossilContext(f)).join('\n\n');
      const context = `${digest}\n\nNEW FOSSIL:\n${newContext}\n\nSIMILAR EXISTING FOSSILS:\n${similarContext}`;

      const result = await callAI(
        data.aiConfig,
        AI_PROMPTS.conflictAnalysis,
        context
      );

      if (!result.fromCache) {
        const today = getDayKey();
        const newSpend = (data.aiConfig.dailySpendDate === today ? data.aiConfig.dailySpend : 0) + result.cost;
        updateAIConfig({ dailySpend: newSpend, dailySpendDate: today });
      }

      return result.response;
    } catch (err) {
      console.error('AI conflict check failed:', err);
      return null;
    }
  }, [data.aiConfig, data.fossils, updateAIConfig]);

  const handleUseProbeAsSuggestion = useCallback(() => {
    if (aiResponse?.type === 'probe' && aiResponse?.content) {
      setIntent(aiResponse.content);
      setAiResponse(null);
    }
  }, [aiResponse]);

  const handleUseSynthesisAsKernel = useCallback(() => {
    if (aiResponse?.type === 'synthesis' && aiResponse?.content) {
      setKernelInProgress(prev => ({ ...prev, invariant: aiResponse.content }));
      setAiResponse(null);
    }
  }, [aiResponse]);

  const handleTestAIConnection = useCallback(async () => {
    setAiTestStatus(null);
    const result = await testAIConnection(data.aiConfig);
    setAiTestStatus(result);
  }, [data.aiConfig]);

  const handleDiscoverOllamaModels = useCallback(async () => {
    const models = await discoverOllamaModels();
    setOllamaModels(models);
  }, []);

  // Discover Ollama models when provider changes to ollama
  useEffect(() => {
    if (data.aiConfig?.provider === 'ollama') {
      handleDiscoverOllamaModels();
    }
  }, [data.aiConfig?.provider, handleDiscoverOllamaModels]);

  const copyFossilMarkdown = useCallback(async (f) => {
    const md = [
      `**Probe:** ${f.probeIntent}`,
      `**Invariant:** ${f.invariant}`,
      `**Model Shift:** ${f.modelShift}`,
      f.payload ? `**Payload:**\n${f.payload}` : ''
    ].filter(Boolean).join('\n\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
      } else {
        const ta = document.createElement('textarea');
        ta.value = md;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }, []);

  const exportMarkdown = useCallback(() => {
    const md = visibleFossils
      .slice()
      .reverse()
      .map(f => {
        const date = f.dayKey || new Date(f.createdAt).toLocaleDateString();
        const frontmatter = [
          `---`,
          `dayKey: ${f.dayKey}`,
          `createdAt: ${f.createdAt}`,
          `type: ${f.artifactType}`,
          `quality: ${f.quality}`,
          `durationSec: ${f.duration}`,
          `reentryOf: ${f.reentryOf || 'null'}`,
          `reuseCount: ${f.reuseCount || 0}`,
          `---`
        ].join('\n');

        const body = [
          `# ${date} — ${f.artifactType || 'Fossil'}`,
          `**Probe:** ${f.probeIntent}`,
          `**Primitives:**`,
          ...(f.primitives || []).map(p => `- ${p}`),
          ``,
          `**Invariant:** ${f.invariant}`,
          `**Model Shift:** ${f.modelShift}`,
          f.payload ? `**Payload:**\n\n${f.payload}` : '',
        ].filter(Boolean).join('\n');

        return `${frontmatter}\n\n${body}`;
      }).join('\n\n---\n\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fossil-vault-${todayKey}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleFossils, todayKey]);

  const focusSet = useMemo(() => 
    focusChainIds ? new Set(focusChainIds) : null, 
  [focusChainIds]);

  const filteredFossils = useMemo(() => {
    let list;
    if (focusChainIds && focusSet) {
      list = focusChainIds
        .map(id => fossilMap[id])
        .filter(f => f && !f.deleted);
    } else {
      list = visibleFossils;
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    
    return list.filter(f => {
      const searchable = `${f.probeIntent} ${f.invariant} ${f.modelShift} ${f.payload}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [visibleFossils, searchQuery, focusChainIds, focusSet, fossilMap]);

  // --- UI Components (unchanged, but using optimized handlers) ---

  const Header = () => (
    <nav className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Terminal className="w-5 h-5 text-emerald-500" />
        <span className="font-mono font-bold tracking-tighter text-lg text-white">FOSSIL</span>
        <span className="text-[8px] font-mono text-emerald-800 bg-emerald-950/30 px-1.5 py-0.5 rounded uppercase">2.0</span>
        {data.aiConfig?.enabled && (
          <span className="text-[8px] font-mono text-purple-700 bg-purple-950/30 px-1.5 py-0.5 rounded uppercase">AI</span>
        )}
      </div>
      <div className="flex gap-4 md:gap-8 items-center">
        {[
          { id: 'today', icon: Zap, label: 'TODAY' },
          { id: 'fossils', icon: Archive, label: 'ARCHIVE' },
          { id: 'graph', icon: GitBranch, label: 'GRAPH' },
          { id: 'harvest', icon: Layers, label: 'HARVEST' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`text-xs font-mono flex items-center gap-1.5 transition-colors ${
              view === item.id
                ? 'text-emerald-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <item.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowAISettings(true)}
          className={`text-xs font-mono flex items-center gap-1 transition-colors ml-2 px-2 py-1 rounded ${
            data.aiConfig?.enabled
              ? 'text-purple-400 hover:text-purple-300 bg-purple-950/20'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="AI Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );

  // --- AI Settings Modal ---
  const AISettingsModal = () => {
    if (!showAISettings) return null;

    const provider = AI_PROVIDERS[data.aiConfig?.provider] || AI_PROVIDERS.openai;
    const models = data.aiConfig?.provider === 'ollama' ? ollamaModels : provider.models;
    const todaySpend = data.aiConfig?.dailySpendDate === getDayKey() ? data.aiConfig?.dailySpend || 0 : 0;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-mono font-bold text-purple-400 flex items-center gap-2">
              <Wand2 className="w-5 h-5" />
              AI CONFIGURATION
            </h2>
            <button onClick={() => setShowAISettings(false)} className="text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between mb-6 p-3 bg-zinc-800 rounded">
            <span className="font-mono text-sm">Enable AI Features</span>
            <button
              onClick={() => updateAIConfig({ enabled: !data.aiConfig?.enabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                data.aiConfig?.enabled ? 'bg-purple-600' : 'bg-zinc-600'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                data.aiConfig?.enabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Provider Selection */}
          <div className="mb-4">
            <label className="block text-xs font-mono text-zinc-500 mb-2">PROVIDER</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(AI_PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => {
                    updateAIConfig({ provider: key, model: p.models[0]?.id || 'default' });
                    setAiTestStatus(null);
                  }}
                  className={`px-3 py-2 rounded text-xs font-mono transition-colors ${
                    data.aiConfig?.provider === key
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key (not for Ollama) */}
          {data.aiConfig?.provider !== 'ollama' && (
            <div className="mb-4">
              <label className="block text-xs font-mono text-zinc-500 mb-2">API KEY</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={data.aiConfig?.apiKey || ''}
                  onChange={(e) => {
                    updateAIConfig({ apiKey: e.target.value });
                    setAiTestStatus(null);
                  }}
                  placeholder="Enter your API key..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 pr-10 font-mono text-sm focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Custom Endpoint */}
          {data.aiConfig?.provider === 'custom' && (
            <div className="mb-4">
              <label className="block text-xs font-mono text-zinc-500 mb-2">ENDPOINT URL</label>
              <input
                type="text"
                value={data.aiConfig?.customEndpoint || ''}
                onChange={(e) => updateAIConfig({ customEndpoint: e.target.value })}
                placeholder="https://your-endpoint.com/v1/chat/completions"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {/* Model Selection */}
          <div className="mb-4">
            <label className="block text-xs font-mono text-zinc-500 mb-2">MODEL</label>
            {models.length > 0 ? (
              <select
                value={data.aiConfig?.model || ''}
                onChange={(e) => updateAIConfig({ model: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-purple-500"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.costPer1k > 0 && `(~$${(m.costPer1k * 1000).toFixed(2)}/1M tokens)`}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-zinc-500 italic">
                {data.aiConfig?.provider === 'ollama'
                  ? 'No models found. Make sure Ollama is running.'
                  : 'No models available'}
              </div>
            )}
            {data.aiConfig?.provider === 'ollama' && (
              <button
                onClick={handleDiscoverOllamaModels}
                className="mt-2 text-xs text-purple-400 hover:text-purple-300"
              >
                Refresh models
              </button>
            )}
          </div>

          {/* Test Connection */}
          <div className="mb-6">
            <button
              onClick={handleTestAIConnection}
              disabled={aiLoading || (!data.aiConfig?.apiKey && data.aiConfig?.provider !== 'ollama')}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded font-mono text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Test Connection
            </button>
            {aiTestStatus && (
              <div className={`mt-2 text-xs font-mono ${aiTestStatus.success ? 'text-emerald-400' : 'text-red-400'}`}>
                {aiTestStatus.success ? 'Connected successfully' : `Error: ${aiTestStatus.error}`}
                {aiTestStatus.warning && <span className="text-amber-400 ml-2">{aiTestStatus.warning}</span>}
              </div>
            )}
          </div>

          {/* Feature Toggles */}
          <div className="mb-6">
            <label className="block text-xs font-mono text-zinc-500 mb-2">FEATURES</label>
            <div className="space-y-2">
              {[
                { key: 'insightSpark', label: 'Insight Spark', desc: '~$0.0004/call' },
                { key: 'probeSuggestion', label: 'Probe Suggestion', desc: '~$0.0006/call' },
                { key: 'conflictAnalysis', label: 'Conflict Analysis', desc: '~$0.001/seal' },
                { key: 'synthesisHelper', label: 'Synthesis Helper', desc: '~$0.002/week' }
              ].map(f => (
                <label key={f.key} className="flex items-center justify-between p-2 bg-zinc-800 rounded cursor-pointer hover:bg-zinc-750">
                  <div>
                    <span className="text-sm font-mono">{f.label}</span>
                    <span className="text-xs text-zinc-500 ml-2">{f.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={data.aiConfig?.features?.[f.key] ?? true}
                    onChange={(e) => updateAIConfig({
                      features: { ...data.aiConfig?.features, [f.key]: e.target.checked }
                    })}
                    className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-purple-500 focus:ring-purple-500"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Daily Spending */}
          <div className="p-3 bg-zinc-800 rounded text-sm font-mono">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Today's spend:</span>
              <span className="text-purple-400">${todaySpend.toFixed(4)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-zinc-400">Daily cap:</span>
              <select
                value={data.aiConfig?.dailyCap || 0.10}
                onChange={(e) => updateAIConfig({ dailyCap: parseFloat(e.target.value) })}
                className="bg-zinc-700 border-none rounded px-2 py-1 text-xs"
              >
                <option value={0.05}>$0.05</option>
                <option value={0.10}>$0.10</option>
                <option value={0.25}>$0.25</option>
                <option value={1.00}>$1.00</option>
                <option value={999}>Unlimited</option>
              </select>
            </div>
          </div>

          <div className="mt-6 text-xs text-zinc-500 text-center">
            API keys are stored locally. For zero-cost usage, try Ollama.
          </div>
        </div>
      </div>
    );
  };

  // --- AI Response Modal ---
  const AIResponseModal = () => {
    if (!aiResponse && !aiError) return null;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 border border-purple-800 rounded-lg p-6 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-mono font-bold text-purple-400 flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              {aiResponse?.type === 'insight' && 'AI INSIGHT'}
              {aiResponse?.type === 'probe' && 'SUGGESTED PROBE'}
              {aiResponse?.type === 'synthesis' && 'AI SYNTHESIS'}
              {aiError && 'AI ERROR'}
            </h2>
            <button
              onClick={() => { setAiResponse(null); setAiError(null); }}
              className="text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {aiError ? (
            <div className="text-red-400 font-mono text-sm p-4 bg-red-950/20 rounded">
              {aiError}
            </div>
          ) : (
            <>
              <div className="text-zinc-200 font-mono text-sm p-4 bg-zinc-800 rounded mb-4 leading-relaxed">
                "{aiResponse?.content}"
              </div>

              {aiResponse?.fromCache && (
                <div className="text-xs text-zinc-500 mb-4">Cached response</div>
              )}

              <div className="flex gap-2">
                {aiResponse?.type === 'probe' && (
                  <button
                    onClick={handleUseProbeAsSuggestion}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded font-mono text-sm hover:bg-purple-500 flex items-center justify-center gap-2"
                  >
                    <Target className="w-4 h-4" />
                    USE AS PROBE
                  </button>
                )}
                {aiResponse?.type === 'synthesis' && (
                  <button
                    onClick={handleUseSynthesisAsKernel}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded font-mono text-sm hover:bg-purple-500 flex items-center justify-center gap-2"
                  >
                    <Brain className="w-4 h-4" />
                    USE AS KERNEL
                  </button>
                )}
                <button
                  onClick={() => { setAiResponse(null); setAiError(null); }}
                  className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded font-mono text-sm hover:bg-zinc-600"
                >
                  DISMISS
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const TodayView = () => (
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

  const ArchiveView = () => (
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

  const HarvestView = () => {
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

  // Conflict Modal Component
  const ConflictModal = () => {
    if (!showConflictModal || pendingConflicts.length === 0) return null;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-red-900/50 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
          <div className="p-5 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest font-bold">
                Conflict Detected
              </span>
            </div>
            <p className="text-zinc-400 text-xs font-mono mt-2">
              Your new invariant may conflict with existing fossils.
            </p>
          </div>

          <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
            {pendingConflicts.map((conflict, idx) => (
              <div key={conflict.fossil.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="text-[9px] font-mono text-zinc-600">
                    {conflict.fossil.dayKey} | similarity: {conflict.similarity}% | {conflict.reason}
                  </div>
                </div>
                <div className="text-zinc-300 font-mono text-sm italic">
                  "{conflict.fossil.invariant}"
                </div>
                {conflict.oppositions?.length > 0 && (
                  <div className="text-[9px] font-mono text-amber-600">
                    Opposing terms: {conflict.oppositions.map(([a, b]) => `${a}/${b}`).join(', ')}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleConflictSupersede(conflict.fossil.id)}
                    className="flex-1 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-mono text-[10px] font-bold rounded-lg transition-colors border border-red-900/50"
                  >
                    SUPERSEDE OLD
                  </button>
                  <button
                    onClick={() => handleConflictCoexist(conflict.fossil.id)}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] font-bold rounded-lg transition-colors border border-zinc-700"
                  >
                    COEXIST
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-5 border-t border-zinc-800 flex gap-3">
            <button
              onClick={() => { setShowConflictModal(false); setPendingConflicts([]); }}
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs font-bold rounded-lg transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleForceSeal}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-lg transition-colors"
            >
              SEAL ANYWAY
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Graph View Component
  const GraphView = () => {
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

  return (
    <div className="min-h-screen bg-black text-zinc-400 font-mono selection:bg-emerald-500/20 antialiased">
      <Header />
      <main className="min-h-[calc(100vh-120px)]">
        {view === 'today' && TodayView()}
        {view === 'fossils' && ArchiveView()}
        {view === 'graph' && GraphView()}
        {view === 'harvest' && HarvestView()}
      </main>
      <ConflictModal />
      <footer className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-md border-t border-zinc-900 py-3 px-6 flex justify-between items-center text-[9px] font-mono tracking-tighter text-zinc-600 z-50">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> FOSSILS: {visibleFossils.length}
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> KERNELS: {data?.kernels?.length || 0}
          </span>
        </div>
        <div className="flex gap-3 items-center">
          {resurfaceFossil && !todayFossil && !data.activeProbe && (
            <div className="px-2 py-0.5 rounded-full border border-amber-900 text-amber-700 bg-amber-950/10">
              RESURFACE_READY
            </div>
          )}
          <div className={`px-2 py-0.5 rounded-full border ${
            todayFossil
              ? 'border-emerald-900 text-emerald-700 bg-emerald-950/10'
              : 'border-amber-900 text-amber-700 bg-amber-950/10'
          }`}>
            {todayFossil ? 'STATION_LOCKED' : 'STATION_OPEN'}
          </div>
          <span className="opacity-40">FOSSIL v2.0.0_INTELLIGENCE</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
