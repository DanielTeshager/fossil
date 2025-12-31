// --- AI Service Layer ---

import { hashString } from '../utils/helpers.js';
import { tokenize } from '../utils/tokenizer.js';

// --- AI Provider Configuration ---
export const AI_PROVIDERS = {
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
    models: [],
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
export const AI_PROMPTS = {
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
 * Build a compressed vault digest for AI context (~400 tokens)
 * This is the key cost-saving innovation - gives AI full visibility cheaply
 */
export const buildVaultDigest = (fossils) => {
  const validFossils = fossils.filter(f => !f.deleted);
  if (validFossils.length === 0) {
    return 'VAULT: Empty - no fossils yet.';
  }

  const sorted = [...validFossils].sort((a, b) =>
    new Date(a.createdAt) - new Date(b.createdAt)
  );
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  // Extract themes using word frequency
  const wordFreq = new Map();
  validFossils.forEach(f => {
    const words = tokenize(f.invariant);
    words.forEach(word => {
      if (word.length > 3) {
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

  // Get most reused fossils
  const activeChains = [...validFossils]
    .sort((a, b) => (b.reuseCount || 0) - (a.reuseCount || 0))
    .slice(0, 3)
    .filter(f => (f.reuseCount || 0) > 0)
    .map(f => `${f.invariant.slice(0, 50)}... (reused ${f.reuseCount}x)`);

  // Recent fossils
  const recent = sorted.slice(-3).map(f =>
    `[${f.dayKey}] ${f.invariant.slice(0, 60)}${f.invariant.length > 60 ? '...' : ''}`
  );

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
 * Get context for a specific fossil
 */
export const getFossilContext = (fossil) => {
  return `FOSSIL [${fossil.dayKey}]:
Probe: ${fossil.probeIntent}
Invariant: ${fossil.invariant}
Model Shift: ${fossil.modelShift || 'none'}
Quality: ${fossil.quality}/5`;
};

/**
 * Call AI with caching and provider adaptation
 */
export const callAI = async (aiConfig, systemPrompt, userContent) => {
  const provider = AI_PROVIDERS[aiConfig.provider];
  if (!provider) throw new Error('Invalid AI provider');

  // Check cache first
  const cacheKey = hashString(systemPrompt + userContent + aiConfig.model);
  const cached = AI_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < 3600000) {
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

  // Estimate cost
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
export const discoverOllamaModels = async () => {
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
export const testAIConnection = async (aiConfig) => {
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
