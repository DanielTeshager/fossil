// --- Intelligence Algorithms ---

import { DISMISS_INTERVALS, ANTONYM_PAIRS, NEGATION_PATTERNS, CONFLICT_THRESHOLD_MIN, CONFLICT_THRESHOLD_MAX } from './constants.js';
import { getDayKey } from './helpers.js';
import { tokenize, getJaccard } from './tokenizer.js';

/**
 * Calculate decay score for a fossil (higher = more urgent to resurface)
 */
export const calculateDecayScore = (fossil, allFossils) => {
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
export const selectResurfaceFossil = (fossils, todayKey) => {
  const now = new Date();
  const eligible = fossils.filter(f =>
    !f.deleted &&
    f.dayKey !== todayKey &&
    (!f.dismissedUntil || new Date(f.dismissedUntil) <= now) &&
    !f.supersededBy
  );

  if (eligible.length === 0) return null;

  const scored = eligible.map(f => ({
    fossil: f,
    score: calculateDecayScore(f, fossils)
  })).filter(s => s.score > -900);

  if (scored.length === 0) return null;

  const sorted = scored.sort((a, b) => b.score - a.score);
  const top5 = sorted.slice(0, 5);

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
export const getNextDismissDate = (dismissCount) => {
  const days = DISMISS_INTERVALS[Math.min(dismissCount, DISMISS_INTERVALS.length - 1)];
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

/**
 * Detect semantic opposition between two texts
 */
export const detectSemanticOpposition = (textA, textB) => {
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
export const detectConflicts = (newInvariant, existingFossils, tokenIndex) => {
  const conflicts = [];
  const newTokens = tokenize(newInvariant);
  const newHasNegation = NEGATION_PATTERNS.some(p => p.test(newInvariant));

  for (const fossil of existingFossils) {
    if (fossil.deleted || fossil.supersededBy) continue;

    const existingTokens = tokenIndex.get(fossil.id) || tokenize(fossil.invariant || '');
    const similarity = getJaccard(newTokens, existingTokens);

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
 * Smart resurface with context matching - resurface related ideas together
 */
export const selectContextualResurface = (fossils, tokenIndex, currentContext = null, todayKey) => {
  const now = new Date();
  const eligible = fossils.filter(f =>
    !f.deleted &&
    f.dayKey !== todayKey &&
    (!f.dismissedUntil || new Date(f.dismissedUntil) <= now) &&
    !f.supersededBy
  );

  if (eligible.length === 0) return null;

  // Score all eligible fossils
  let scored = eligible.map(f => ({
    fossil: f,
    decayScore: calculateDecayScore(f, fossils),
    contextScore: 0,
    engagementScore: calculateEngagementScore(f)
  })).filter(s => s.decayScore > -900);

  if (scored.length === 0) return null;

  // If we have context (e.g., current probe intent or recent fossil), boost related ones
  if (currentContext) {
    const contextTokens = tokenize(currentContext);
    scored = scored.map(s => {
      const fossilTokens = tokenIndex.get(s.fossil.id) || tokenize(s.fossil.invariant || '');
      const similarity = getJaccard(contextTokens, fossilTokens);
      return {
        ...s,
        contextScore: similarity * 2 // Boost contextually relevant fossils
      };
    });
  }

  // Combined score: decay + context + engagement
  scored = scored.map(s => ({
    ...s,
    totalScore: s.decayScore + s.contextScore + s.engagementScore
  }));

  const sorted = scored.sort((a, b) => b.totalScore - a.totalScore);
  const top5 = sorted.slice(0, 5);

  // Weighted random from top candidates
  const totalWeight = top5.reduce((sum, s) => sum + Math.exp(s.totalScore), 0);
  let random = Math.random() * totalWeight;

  for (const item of top5) {
    random -= Math.exp(item.totalScore);
    if (random <= 0) return item.fossil;
  }

  return top5[0]?.fossil || null;
};

/**
 * Calculate engagement score based on user interaction history
 */
export const calculateEngagementScore = (fossil) => {
  let score = 0;

  // Positive engagement signals
  if (fossil.reinforceCount > 0) score += fossil.reinforceCount * 0.3;
  if (fossil.reuseCount > 0) score += fossil.reuseCount * 0.2;
  if (fossil.quality >= 4) score += 0.2;

  // Negative engagement signals
  if (fossil.dismissCount > 2) score -= 0.3;
  if (fossil.skipCount > 3) score -= 0.2;

  // Time-based engagement (fossils engaged with at similar times)
  const hour = new Date().getHours();
  if (fossil.lastRevisitedAt) {
    const lastHour = new Date(fossil.lastRevisitedAt).getHours();
    // Small boost if previously engaged at similar time of day
    if (Math.abs(hour - lastHour) <= 2) score += 0.1;
  }

  return score;
};

/**
 * Get resurface batch - multiple related fossils to review together
 */
export const getResurfaceBatch = (fossils, tokenIndex, batchSize = 3) => {
  const todayKey = getDayKey();
  const batch = [];

  // Get first fossil using standard selection
  const first = selectResurfaceFossil(fossils, todayKey);
  if (!first) return batch;

  batch.push(first);

  // Find related fossils for context
  const firstTokens = tokenIndex.get(first.id) || tokenize(first.invariant || '');

  const now = new Date();
  const candidates = fossils.filter(f =>
    !f.deleted &&
    f.id !== first.id &&
    f.dayKey !== todayKey &&
    (!f.dismissedUntil || new Date(f.dismissedUntil) <= now) &&
    !f.supersededBy
  );

  const related = candidates
    .map(f => {
      const tokens = tokenIndex.get(f.id) || tokenize(f.invariant || '');
      return {
        fossil: f,
        similarity: getJaccard(firstTokens, tokens)
      };
    })
    .filter(r => r.similarity > 0.15 && r.similarity < 0.7)
    .sort((a, b) => b.similarity - a.similarity);

  // Add related fossils to batch
  for (const r of related) {
    if (batch.length >= batchSize) break;
    batch.push(r.fossil);
  }

  return batch;
};

/**
 * Record resurface engagement for learning
 */
export const recordResurfaceEngagement = (fossil, action) => {
  const updates = {
    lastRevisitedAt: new Date().toISOString()
  };

  switch (action) {
    case 'reinforce':
      updates.reinforceCount = (fossil.reinforceCount || 0) + 1;
      break;
    case 'reentry':
      updates.reuseCount = (fossil.reuseCount || 0) + 1;
      break;
    case 'dismiss':
      updates.dismissCount = (fossil.dismissCount || 0) + 1;
      break;
    case 'skip':
      updates.skipCount = (fossil.skipCount || 0) + 1;
      break;
  }

  return updates;
};

/**
 * Calculate current streak and stats
 */
export const calculateStreak = (fossils) => {
  const validFossils = fossils.filter(f => !f.deleted);
  if (validFossils.length === 0) return { current: 0, longest: 0, total: 0, gaps: [] };

  const dayKeys = [...new Set(validFossils.map(f => f.dayKey))].sort().reverse();
  const today = getDayKey();

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const gaps = [];

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDayKey(yesterday);

  const hasToday = dayKeys.includes(today);
  const hasYesterday = dayKeys.includes(yesterdayKey);

  if (hasToday || hasYesterday) {
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
    gaps: gaps.slice(0, 5)
  };
};
