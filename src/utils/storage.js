// --- Storage & Data Persistence ---

import { STORAGE_KEY, LEGACY_KEYS, DEFAULT_AI_CONFIG } from './constants.js';
import { getDayKey } from './helpers.js';

/**
 * Migrate data structure to latest version
 */
export const migrate = (parsed) => {
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

  const aiConfig = parsed?.aiConfig || { ...DEFAULT_AI_CONFIG };

  return {
    fossils,
    kernels,
    activeKernelId: parsed?.activeKernelId || null,
    activeProbe: parsed?.activeProbe || null,
    aiConfig,
    vaultDigest: parsed?.vaultDigest || null
  };
};

/**
 * Load data from localStorage with migration support
 */
export const loadData = () => {
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
    return { fossils: [], kernels: [], activeKernelId: null, activeProbe: null, aiConfig: { ...DEFAULT_AI_CONFIG } };
  }
};

/**
 * Save data to localStorage
 */
export const saveData = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Save failed", e);
  }
};
