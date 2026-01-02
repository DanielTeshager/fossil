// --- Tokenizer Tests ---

import { describe, it, expect } from 'vitest';
import { tokenize, getJaccard } from './tokenizer.js';

describe('tokenize', () => {
  it('returns empty set for empty string', () => {
    expect(tokenize('')).toEqual(new Set());
  });

  it('returns empty set for null/undefined', () => {
    expect(tokenize(null)).toEqual(new Set());
    expect(tokenize(undefined)).toEqual(new Set());
  });

  it('extracts words with 3+ characters', () => {
    const result = tokenize('The quick brown fox');
    expect(result.has('the')).toBe(true);
    expect(result.has('quick')).toBe(true);
    expect(result.has('brown')).toBe(true);
    expect(result.has('fox')).toBe(true);
  });

  it('filters out 2-character words', () => {
    const result = tokenize('I am a programmer');
    expect(result.has('programmer')).toBe(true);
    expect(result.has('am')).toBe(false);
  });

  it('handles hyphenated words', () => {
    const result = tokenize('self-referential loop');
    expect(result.has('self-referential')).toBe(true);
    expect(result.has('loop')).toBe(true);
  });

  it('is case insensitive', () => {
    const result = tokenize('UPPERCASE lowercase');
    expect(result.has('uppercase')).toBe(true);
    expect(result.has('lowercase')).toBe(true);
  });

  it('caches results for same input', () => {
    const input = 'cached input test';
    const result1 = tokenize(input);
    const result2 = tokenize(input);
    expect(result1).toBe(result2); // Same reference due to caching
  });
});

describe('getJaccard', () => {
  it('returns 0 for empty sets', () => {
    expect(getJaccard(new Set(), new Set())).toBe(0);
    expect(getJaccard(new Set(['a']), new Set())).toBe(0);
    expect(getJaccard(new Set(), new Set(['a']))).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    const set = new Set(['a', 'b', 'c']);
    expect(getJaccard(set, set)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const setA = new Set(['a', 'b']);
    const setB = new Set(['c', 'd']);
    expect(getJaccard(setA, setB)).toBe(0);
  });

  it('calculates correct similarity', () => {
    const setA = new Set(['a', 'b', 'c']);
    const setB = new Set(['b', 'c', 'd']);
    // Intersection: {b, c} = 2
    // Union: {a, b, c, d} = 4
    // Jaccard = 2/4 = 0.5
    expect(getJaccard(setA, setB)).toBe(0.5);
  });

  it('handles null/undefined gracefully', () => {
    expect(getJaccard(null, new Set(['a']))).toBe(0);
    expect(getJaccard(new Set(['a']), null)).toBe(0);
  });
});
