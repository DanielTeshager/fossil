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
