// --- FOSSIL Type Definitions ---

/**
 * Core Fossil type - represents a captured insight
 */
export interface Fossil {
  id: string;
  dayKey: string;
  createdAt: string;
  probeIntent: string;
  primitives: string[];
  invariant: string;
  modelShift: string;
  quality: 1 | 2 | 3 | 4 | 5;
  artifactType: 'Note' | 'Link' | 'Snippet';
  payload: string;
  reentryOf: string | null;
  duration: number;
  deleted: boolean;
  reuseCount: number;

  // Intelligence fields
  lastRevisitedAt: string | null;
  dismissedUntil: string | null;
  reinforceCount: number;
  dismissCount: number;
  skipCount?: number;
  supersededBy: string | null;
  supersedes: string | null;
  coexistsWith: string[];
}

/**
 * Kernel type - synthesized insight from multiple fossils
 */
export interface Kernel {
  id: string;
  date: string;
  invariant: string;
  counterpoint: string;
  nextDirection: string;
  fossilIds: string[];
}

/**
 * Active Probe - current exploration session
 */
export interface ActiveProbe {
  intent: string;
  startTime: number;
  reentryOf: string | null;
}

/**
 * AI Configuration
 */
export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  apiKey: string;
  model: string;
  customEndpoint?: string;
}

/**
 * Manual graph edge - user-created connection
 */
export interface ManualEdge {
  source: string;
  target: string;
  label?: string;
  createdAt: string;
}

/**
 * Node annotation for graph view
 */
export interface NodeAnnotations {
  [nodeId: string]: string;
}

/**
 * Main app data structure
 */
export interface AppData {
  fossils: Fossil[];
  kernels: Kernel[];
  activeKernelId: string | null;
  activeProbe: ActiveProbe | null;
  aiConfig: AIConfig;
  vaultDigest: string | null;
  manualEdges: ManualEdge[];
  nodeAnnotations: NodeAnnotations;
}

/**
 * Compression form state
 */
export interface CompressionState {
  primitives: [string, string, string];
  quickPrimitives: string;
  invariant: string;
  modelShift: string;
  quality: 1 | 2 | 3 | 4 | 5;
}

/**
 * Graph node for visualization
 */
export interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  invariant: string;
  dayKey: string;
  cluster?: number;
  size?: number;
}

/**
 * Graph edge for visualization
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: 'reentry' | 'similarity' | 'manual';
  weight?: number;
}

/**
 * Graph data structure
 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Conflict detection result
 */
export interface Conflict {
  fossil: Fossil;
  similarity: number;
  reason: 'negation' | 'semantic';
  oppositions: [string, string][];
}

/**
 * Related fossil result
 */
export interface RelatedFossil {
  fossil: Fossil;
  similarity: number;
  sharedConcepts: string[];
}

/**
 * Cluster detection result
 */
export interface Cluster {
  ids: string[];
  size: number;
  theme: string[];
  fossils: Fossil[];
}

/**
 * Insight from proactive analysis
 */
export interface Insight {
  type: 'pattern' | 'synthesis' | 'bridge' | 'gap' | 'connections' | 'trend';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  priority: number;
  fossilId?: string;
  clusterIds?: string[];
  suggestions?: ConnectionSuggestion[];
  action?: string;
}

/**
 * Connection suggestion for graph
 */
export interface ConnectionSuggestion {
  sourceId: string;
  targetId: string;
  similarity: number;
  reason: string;
  sharedConcepts: string[];
}

/**
 * Streak statistics
 */
export interface StreakStats {
  current: number;
  longest: number;
  total: number;
  gaps: Array<{
    from: string;
    to: string;
    days: number;
  }>;
}

/**
 * AI Provider configuration
 */
export interface AIProvider {
  name: string;
  models: AIModel[];
  baseUrl: string;
  authHeader: (key: string) => Record<string, string>;
  formatRequest: (messages: AIMessage[], model: string) => object;
  parseResponse: (data: unknown) => string;
  isLocal?: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  costPer1k: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  response: string;
  fromCache: boolean;
  cost: number;
}

/**
 * View types
 */
export type ViewType = 'today' | 'fossils' | 'graph' | 'harvest';

/**
 * Graph interaction mode
 */
export type GraphMode = 'view' | 'connect' | 'merge';

/**
 * Resurface engagement action
 */
export type ResurfaceAction = 'reinforce' | 'reentry' | 'dismiss' | 'skip';
