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
  selectResurfaceFossil,
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

  // Register keyboard shortcuts
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
      {Header()}
      <main className="min-h-[calc(100vh-120px)]">
        {view === 'today' && TodayView()}
        {view === 'fossils' && ArchiveView()}
        {view === 'graph' && GraphView()}
        {view === 'harvest' && HarvestView()}
      </main>
      {ConflictModal()}
      {AISettingsModal()}

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
