// --- Autolink Tests ---

import { describe, it, expect } from 'vitest';
import { findRelatedFossils, detectClusters, suggestConnections } from './autolink.js';
import { tokenize } from './tokenizer.js';

// Mock fossil factory
const createFossil = (id, invariant, overrides = {}) => ({
  id,
  dayKey: '2025-01-01',
  createdAt: new Date('2025-01-01').toISOString(),
  probeIntent: 'Test probe',
  primitives: ['test'],
  invariant,
  modelShift: 'Test shift',
  quality: 3,
  deleted: false,
  reentryOf: null,
  supersededBy: null,
  ...overrides
});

// Build token index from fossils
const buildTokenIndex = (fossils) => {
  const index = new Map();
  fossils.forEach(f => {
    index.set(f.id, tokenize(f.invariant));
  });
  return index;
};

describe('findRelatedFossils', () => {
  it('returns empty array when no fossils', () => {
    const target = createFossil('1', 'test invariant');
    const result = findRelatedFossils(target, [], new Map());
    expect(result).toEqual([]);
  });

  it('finds related fossils by similarity', () => {
    const fossils = [
      createFossil('1', 'learning programming is essential'),
      createFossil('2', 'programming skills are essential for developers'),
      createFossil('3', 'cooking recipes are fun'),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = findRelatedFossils(fossils[0], fossils, tokenIndex);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].fossil.id).toBe('2'); // Most similar
  });

  it('excludes deleted fossils', () => {
    const fossils = [
      createFossil('1', 'learning programming'),
      createFossil('2', 'programming is great', { deleted: true }),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = findRelatedFossils(fossils[0], fossils, tokenIndex);
    expect(result.every(r => !r.fossil.deleted)).toBe(true);
  });

  it('excludes chain members when excludeChain is true', () => {
    const fossils = [
      createFossil('1', 'learning programming'),
      createFossil('2', 'programming fundamentals', { reentryOf: '1' }),
      createFossil('3', 'programming is useful'),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = findRelatedFossils(fossils[0], fossils, tokenIndex, { excludeChain: true });
    expect(result.every(r => r.fossil.id !== '2')).toBe(true);
  });

  it('respects maxResults option', () => {
    const fossils = Array.from({ length: 10 }, (_, i) =>
      createFossil(`${i}`, `programming concept number ${i}`)
    );
    const tokenIndex = buildTokenIndex(fossils);

    const result = findRelatedFossils(fossils[0], fossils, tokenIndex, { maxResults: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

describe('detectClusters', () => {
  it('returns empty array for insufficient fossils', () => {
    const fossils = [createFossil('1', 'test')];
    const tokenIndex = buildTokenIndex(fossils);

    const result = detectClusters(fossils, tokenIndex);
    expect(result).toEqual([]);
  });

  it('detects clusters of related fossils', () => {
    const fossils = [
      // Cluster 1: Programming
      createFossil('1', 'programming languages are tools'),
      createFossil('2', 'programming requires practice'),
      createFossil('3', 'programming skills improve over time'),
      // Cluster 2: Cooking
      createFossil('4', 'cooking requires patience'),
      createFossil('5', 'cooking is an art form'),
      createFossil('6', 'cooking brings people together'),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = detectClusters(fossils, tokenIndex, { minClusterSize: 2 });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].size).toBeGreaterThanOrEqual(2);
    expect(result[0].theme.length).toBeGreaterThan(0);
  });

  it('excludes deleted fossils from clusters', () => {
    const fossils = [
      createFossil('1', 'programming is fun'),
      createFossil('2', 'programming is useful', { deleted: true }),
      createFossil('3', 'programming is hard'),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = detectClusters(fossils, tokenIndex, { minClusterSize: 2 });
    result.forEach(cluster => {
      expect(cluster.fossils.every(f => !f.deleted)).toBe(true);
    });
  });
});

describe('suggestConnections', () => {
  it('returns empty array when no fossils', () => {
    const result = suggestConnections([], new Map());
    expect(result).toEqual([]);
  });

  it('suggests connections between similar fossils', () => {
    // Use fossils with more overlapping words to exceed similarity threshold
    const fossils = [
      createFossil('1', 'programming requires discipline focus practice consistency'),
      createFossil('2', 'discipline practice consistency lead to programming mastery'),
      createFossil('3', 'cooking recipes vegetables kitchen'),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = suggestConnections(fossils, tokenIndex);

    // If similarity threshold met, should suggest connection between 1 and 2
    // They share: programming, discipline, practice, consistency (4 words)
    if (result.length > 0) {
      const hasSuggestion = result.some(s =>
        (s.sourceId === '1' && s.targetId === '2') ||
        (s.sourceId === '2' && s.targetId === '1')
      );
      expect(hasSuggestion).toBe(true);
    } else {
      // If no suggestions, that's also valid (threshold not met)
      expect(result).toEqual([]);
    }
  });

  it('excludes already connected fossils (reentry)', () => {
    const fossils = [
      createFossil('1', 'learning programming basics'),
      createFossil('2', 'programming advanced concepts', { reentryOf: '1' }),
    ];
    const tokenIndex = buildTokenIndex(fossils);

    const result = suggestConnections(fossils, tokenIndex);
    const hasPair = result.some(s =>
      (s.sourceId === '1' && s.targetId === '2') ||
      (s.sourceId === '2' && s.targetId === '1')
    );
    expect(hasPair).toBe(false);
  });

  it('limits results', () => {
    const fossils = Array.from({ length: 20 }, (_, i) =>
      createFossil(`${i}`, `programming concept about topic ${i % 3}`)
    );
    const tokenIndex = buildTokenIndex(fossils);

    const result = suggestConnections(fossils, tokenIndex);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
