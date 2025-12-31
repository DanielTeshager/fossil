// --- Configuration & Constants ---

export const STORAGE_KEY = 'fossil_data_v2.0.0';

export const LEGACY_KEYS = [
  'fossil_data_v1.2.5', 'fossil_data_v1.2.4', 'fossil_data_v1.2.3',
  'fossil_data_v1.2.2', 'fossil_data_v1.2.1',
];

export const PROBE_TEMPLATES = [
  { label: 'Mechanism Hunt', intent: 'Mechanism Hunt: What mechanism would make [X] inevitable?' },
  { label: 'Invariant Hunt', intent: 'Invariant Hunt: What stays true when [X] scale changes?' },
  { label: 'Feedback Hunt', intent: 'Feedback Hunt: What feedback loop controls [X] behavior?' }
];

// Similarity thresholds
export const REENTRY_THRESHOLD = 0.35;
export const CONFLICT_THRESHOLD_MIN = 0.25;
export const CONFLICT_THRESHOLD_MAX = 0.85;
export const SEMANTIC_EDGE_THRESHOLD = 0.30;
export const DEBOUNCE_MS = 300;

// Spaced repetition intervals (Fibonacci-like)
export const DISMISS_INTERVALS = [1, 2, 3, 5, 8, 13, 21, 34];

// Antonym pairs for conflict detection
export const ANTONYM_PAIRS = [
  ['increase', 'decrease'], ['grow', 'shrink'], ['always', 'never'],
  ['more', 'less'], ['better', 'worse'], ['success', 'failure'],
  ['enable', 'prevent'], ['require', 'optional'], ['must', 'should'],
  ['accelerate', 'decelerate'], ['expand', 'contract'], ['simple', 'complex'],
  ['fast', 'slow'], ['high', 'low'], ['start', 'stop'], ['open', 'close']
];

// Negation patterns for conflict detection
export const NEGATION_PATTERNS = [
  /\bnot\b/i, /\bnever\b/i, /\bcan't\b/i, /\bcannot\b/i,
  /\bwon't\b/i, /\bisn't\b/i, /\baren't\b/i, /\bwithout\b/i,
  /\bcontrary\b/i, /\bopposite\b/i, /\bfails\b/i, /\bdoesn't\b/i
];

// Graph cluster colors
export const CLUSTER_COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];

// Default AI configuration
export const DEFAULT_AI_CONFIG = {
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
