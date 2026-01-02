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

// --- Utility Imports ---
import {
  PROBE_TEMPLATES,
  REENTRY_THRESHOLD,
  DEBOUNCE_MS,
  CLUSTER_COLORS
} from './utils/constants.js';

import {
  generateId,
  getDayKey,
  isValidUrl
} from './utils/helpers.js';

import {
  tokenize,
  getJaccard
} from './utils/tokenizer.js';

import {
  selectContextualResurface,
  getNextDismissDate,
  detectConflicts,
  calculateStreak
} from './utils/intelligence.js';

import {
  buildGraphData,
  layoutGraph
} from './utils/graph.js';

import {
  loadData,
  saveData,
  migrate
} from './utils/storage.js';

import {
  exportVaultJSON,
  validateImportData
} from './utils/export.js';

// --- Service Imports ---
import {
  AI_PROVIDERS,
  AI_PROMPTS,
  buildVaultDigest,
  getFossilContext,
  callAI,
  discoverOllamaModels,
  testAIConnection
} from './services/ai.js';

// --- Hook Imports ---
import { useDebounce } from './hooks/useDebounce.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';

// --- Component Imports ---
import { CommandPalette } from './components/CommandPalette.jsx';
import { QuickCapture } from './components/QuickCapture.jsx';

// --- View Imports ---
import { TodayView } from './views/TodayView.jsx';
import { ArchiveView } from './views/ArchiveView.jsx';
import { HarvestView } from './views/HarvestView.jsx';
import { GraphView } from './views/GraphView.jsx';

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
  const [editingAnnotation, setEditingAnnotation] = useState(null);

  // Graph edges and annotations are now persisted in data
  const manualEdges = data.manualEdges || [];
  const nodeAnnotations = data.nodeAnnotations || {};

  const setManualEdges = useCallback((updater) => {
    setData(prev => ({
      ...prev,
      manualEdges: typeof updater === 'function' ? updater(prev.manualEdges || []) : updater
    }));
  }, []);

  const setNodeAnnotations = useCallback((updater) => {
    setData(prev => ({
      ...prev,
      nodeAnnotations: typeof updater === 'function' ? updater(prev.nodeAnnotations || {}) : updater
    }));
  }, []);

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

  // Command Palette & Quick Capture state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);

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

  // --- Keyboard Shortcuts ---
  const handleCommandPaletteAction = useCallback((action, payload) => {
    switch (action) {
      case 'navigate':
        setView(payload);
        setShowCommandPalette(false);
        break;
      case 'newProbe':
        setView('today');
        setShowCommandPalette(false);
        break;
      case 'quickCapture':
        setShowQuickCapture(true);
        setShowCommandPalette(false);
        break;
      case 'aiInsight':
        handleAIInsightSpark();
        setShowCommandPalette(false);
        break;
      case 'aiProbe':
        handleAIProbeSuggestion();
        setShowCommandPalette(false);
        break;
      case 'export':
        exportVaultJSON(data);
        setShowCommandPalette(false);
        break;
      case 'settings':
        setShowAISettings(true);
        setShowCommandPalette(false);
        break;
      case 'viewFossil':
        setView('fossils');
        setSearchQuery(payload.invariant.slice(0, 20));
        setShowCommandPalette(false);
        break;
      default:
        break;
    }
  }, [data]);

  const handleQuickCapture = useCallback((fossil) => {
    setData(prev => ({
      ...prev,
      fossils: [fossil, ...prev.fossils],
      activeProbe: null
    }));
  }, []);

  // --- Intelligence Engine ---

  const fossilMap = useMemo(() =>
    Object.fromEntries((data.fossils || []).map(f => [f.id, f])),
  [data.fossils]);

  const visibleFossils = useMemo(() =>
    (data.fossils || []).filter(f => !f.deleted),
  [data.fossils]);

  // Register keyboard shortcuts (after visibleFossils is defined)
  const shortcuts = useMemo(() => ({
    'mod+k': () => setShowCommandPalette(true),
    'mod+n': () => {
      if (!data.activeProbe && !visibleFossils.find(f => f.dayKey === getDayKey())) {
        setView('today');
      }
    },
    'mod+shift+n': () => setShowQuickCapture(true),
    'escape': () => {
      if (showCommandPalette) setShowCommandPalette(false);
      else if (showQuickCapture) setShowQuickCapture(false);
      else if (showAISettings) setShowAISettings(false);
      else if (showConflictModal) setShowConflictModal(false);
      else if (aiResponse) setAiResponse(null);
    },
  }), [showCommandPalette, showQuickCapture, showAISettings, showConflictModal, aiResponse, data.activeProbe, visibleFossils]);

  useKeyboardShortcuts(shortcuts);

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
  // Uses contextual resurface to select relevant fossils based on current context
  useEffect(() => {
    if (!todayFossil && !data.activeProbe && visibleFossils.length > 0) {
      const context = intent || (visibleFossils.length > 0
        ? visibleFossils.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.invariant
        : null);
      const candidate = selectContextualResurface(data.fossils, fossilTokenIndex, context, todayKey);
      setResurfaceFossil(candidate);
    } else {
      setResurfaceFossil(null);
    }
  }, [data.fossils, data.activeProbe, todayFossil, todayKey, visibleFossils.length, intent, fossilTokenIndex]);

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
    const requiresKey = data.aiConfig?.provider !== 'ollama';
    if (!data.aiConfig?.enabled || (requiresKey && !data.aiConfig?.apiKey)) {
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
    const requiresKey = data.aiConfig?.provider !== 'ollama';
    if (!data.aiConfig?.enabled || (requiresKey && !data.aiConfig?.apiKey)) {
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
    const requiresKey = data.aiConfig?.provider !== 'ollama';
    if (!data.aiConfig?.enabled || (requiresKey && !data.aiConfig?.apiKey)) {
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

  return (
    <div className="min-h-screen bg-black text-zinc-400 font-mono selection:bg-emerald-500/20 antialiased">
      {Header()}
      <main id="main-content" className="min-h-[calc(100vh-120px)]">
        {view === 'today' && (
          <TodayView
            activeKernel={activeKernel}
            todayFossil={todayFossil}
            todayKey={todayKey}
            data={data}
            visibleFossils={visibleFossils}
            fossilTokenIndex={fossilTokenIndex}
            resurfaceFossil={resurfaceFossil}
            reentryWarning={reentryWarning}
            canSeal={canSeal}
            now={now}
            mode={mode}
            setMode={setMode}
            intent={intent}
            setIntent={setIntent}
            compression={compression}
            setCompression={setCompression}
            fossilType={fossilType}
            setFossilType={setFossilType}
            payload={payload}
            setPayload={setPayload}
            setData={setData}
            setView={setView}
            setFocusChainIds={setFocusChainIds}
            handleSealWithConflictCheck={handleSealWithConflictCheck}
            handleDrillDown={handleDrillDown}
            handleResurfaceChallenge={handleResurfaceChallenge}
            handleResurfaceReinforce={handleResurfaceReinforce}
            handleResurfaceDismiss={handleResurfaceDismiss}
            handleAIInsightSpark={handleAIInsightSpark}
          />
        )}
        {view === 'fossils' && (
          <ArchiveView
            streakStats={streakStats}
            focusChainIds={focusChainIds}
            filteredFossils={filteredFossils}
            fossilMap={fossilMap}
            searchQuery={searchQuery}
            fileInputRef={fileInputRef}
            setFocusChainIds={setFocusChainIds}
            setSearchQuery={setSearchQuery}
            exportMarkdown={exportMarkdown}
            handleExportJSON={handleExportJSON}
            handleImportJSON={handleImportJSON}
            getTrail={getTrail}
            handleDrillDown={handleDrillDown}
            copyFossilMarkdown={copyFossilMarkdown}
            deleteFossil={deleteFossil}
          />
        )}
        {view === 'graph' && (
          <GraphView
            graphData={graphData}
            graphZoom={graphZoom}
            graphMode={graphMode}
            connectSource={connectSource}
            mergeTargets={mergeTargets}
            manualEdges={manualEdges}
            nodeAnnotations={nodeAnnotations}
            selectedGraphNode={selectedGraphNode}
            editingAnnotation={editingAnnotation}
            fossilMap={fossilMap}
            setGraphZoom={setGraphZoom}
            setGraphMode={setGraphMode}
            setConnectSource={setConnectSource}
            setMergeTargets={setMergeTargets}
            setSelectedGraphNode={setSelectedGraphNode}
            setEditingAnnotation={setEditingAnnotation}
            handleGraphNodeClick={handleGraphNodeClick}
            handleMergeFossils={handleMergeFossils}
            handleAddAnnotation={handleAddAnnotation}
            handleRemoveManualEdge={handleRemoveManualEdge}
            handleDrillDown={handleDrillDown}
          />
        )}
        {view === 'harvest' && (
          <HarvestView
            rankedCandidates={rankedCandidates}
            kernelInProgress={kernelInProgress}
            data={data}
            setKernelInProgress={setKernelInProgress}
            sealKernel={sealKernel}
            setData={setData}
          />
        )}
      </main>
      {ConflictModal()}
      {AISettingsModal()}
      {AIResponseModal()}

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        fossils={data.fossils}
        onAction={handleCommandPaletteAction}
        currentView={view}
      />

      {/* Quick Capture */}
      <QuickCapture
        isOpen={showQuickCapture}
        onClose={() => setShowQuickCapture(false)}
        onCapture={handleQuickCapture}
        existingProbe={data.activeProbe}
      />

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
          <button
            onClick={() => setShowCommandPalette(true)}
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-800 hover:border-zinc-700 hover:text-zinc-400 transition-colors"
            title="Command Palette"
          >
            <span>⌘K</span>
          </button>
          <span className="opacity-40">FOSSIL v2.1.0</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
