// --- Intelligence Algorithm Tests ---

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDecayScore,
  selectContextualResurface,
  getNextDismissDate,
  detectSemanticOpposition,
  detectConflicts,
  calculateStreak,
  calculateEngagementScore
} from './intelligence.js';

// Mock fossil factory
const createFossil = (overrides = {}) => ({
  id: `fossil-${Math.random().toString(36).substr(2, 9)}`,
  dayKey: '2025-01-01',
  createdAt: new Date('2025-01-01').toISOString(),
  probeIntent: 'Test probe',
  primitives: ['test'],
  invariant: 'Test invariant',
  modelShift: 'Test shift',
  quality: 3,
  deleted: false,
  reuseCount: 0,
  reinforceCount: 0,
  dismissCount: 0,
  lastRevisitedAt: null,
  dismissedUntil: null,
  supersededBy: null,
  reentryOf: null,
  ...overrides
});

describe('calculateDecayScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));
  });

  it('returns -999 for fossils less than 7 days old', () => {
    const fossil = createFossil({
      createdAt: new Date('2025-01-10').toISOString()
    });
    expect(calculateDecayScore(fossil, [])).toBe(-999);
  });

  it('returns positive score for older fossils', () => {
    const fossil = createFossil({
      createdAt: new Date('2025-01-01').toISOString() // 14 days old
    });
    expect(calculateDecayScore(fossil, [])).toBeGreaterThan(0);
  });

  it('reduces score for high quality fossils', () => {
    const lowQuality = createFossil({
      createdAt: new Date('2025-01-01').toISOString(),
      quality: 1
    });
    const highQuality = createFossil({
      createdAt: new Date('2025-01-01').toISOString(),
      quality: 5
    });

    expect(calculateDecayScore(lowQuality, []))
      .toBeGreaterThan(calculateDecayScore(highQuality, []));
  });

  it('reduces score for frequently reused fossils', () => {
    const noReuse = createFossil({
      createdAt: new Date('2025-01-01').toISOString(),
      reuseCount: 0
    });
    const highReuse = createFossil({
      createdAt: new Date('2025-01-01').toISOString(),
      reuseCount: 5
    });

    expect(calculateDecayScore(noReuse, []))
      .toBeGreaterThan(calculateDecayScore(highReuse, []));
  });
});

describe('calculateEngagementScore', () => {
  it('returns 0 for fossil with no engagement', () => {
    const fossil = createFossil();
    expect(calculateEngagementScore(fossil)).toBe(0);
  });

  it('increases score for reinforcement', () => {
    const fossil = createFossil({ reinforceCount: 3 });
    expect(calculateEngagementScore(fossil)).toBeGreaterThan(0);
  });

  it('decreases score for high dismiss count', () => {
    const fossil = createFossil({ dismissCount: 5 });
    expect(calculateEngagementScore(fossil)).toBeLessThan(0);
  });

  it('increases score for high quality', () => {
    const fossil = createFossil({ quality: 5 });
    expect(calculateEngagementScore(fossil)).toBeGreaterThan(0);
  });
});

describe('getNextDismissDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));
  });

  it('returns date 1 day ahead for first dismiss', () => {
    const result = getNextDismissDate(0);
    expect(result).toBe('2025-01-16');
  });

  it('increases interval with dismiss count', () => {
    const first = getNextDismissDate(0);
    const second = getNextDismissDate(1);
    const third = getNextDismissDate(2);

    expect(new Date(first).getTime()).toBeLessThan(new Date(second).getTime());
    expect(new Date(second).getTime()).toBeLessThan(new Date(third).getTime());
  });
});

describe('detectSemanticOpposition', () => {
  it('detects antonym pairs', () => {
    const result = detectSemanticOpposition(
      'things should increase over time',
      'things will decrease eventually'
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(([a, b]) =>
      (a === 'increase' && b === 'decrease') ||
      (a === 'decrease' && b === 'increase')
    )).toBe(true);
  });

  it('detects simple/complex antonyms', () => {
    const result = detectSemanticOpposition(
      'keep it simple',
      'this is complex'
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty array for non-opposing texts', () => {
    const result = detectSemanticOpposition(
      'learning is important',
      'knowledge is power'
    );
    expect(result.length).toBe(0);
  });
});

describe('calculateStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));
  });

  it('returns 0 for empty fossils array', () => {
    const result = calculateStreak([]);
    expect(result.current).toBe(0);
    expect(result.total).toBe(0);
  });

  it('returns 1 for single fossil today', () => {
    const fossils = [createFossil({ dayKey: '2025-01-15' })];
    const result = calculateStreak(fossils);
    expect(result.current).toBe(1);
    expect(result.total).toBe(1);
  });

  it('counts consecutive days', () => {
    const fossils = [
      createFossil({ dayKey: '2025-01-15' }),
      createFossil({ dayKey: '2025-01-14' }),
      createFossil({ dayKey: '2025-01-13' }),
    ];
    const result = calculateStreak(fossils);
    expect(result.current).toBe(3);
  });

  it('breaks streak on gap', () => {
    const fossils = [
      createFossil({ dayKey: '2025-01-15' }),
      createFossil({ dayKey: '2025-01-13' }), // Gap on 14th
    ];
    const result = calculateStreak(fossils);
    expect(result.current).toBe(1);
  });

  it('excludes deleted fossils', () => {
    const fossils = [
      createFossil({ dayKey: '2025-01-15', deleted: true }),
    ];
    const result = calculateStreak(fossils);
    expect(result.current).toBe(0);
  });
});
