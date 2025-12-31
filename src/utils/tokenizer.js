// --- Tokenization & Similarity Functions ---

/**
 * TOKENIZER (Pure Function)
 * Memoization candidate - same input always produces same output
 */
export const tokenize = (() => {
  const cache = new Map();
  const MAX_CACHE_SIZE = 1000;

  return (s) => {
    if (!s) return new Set();
    if (cache.has(s)) return cache.get(s);

    const tokens = new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []));

    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(s, tokens);
    return tokens;
  };
})();

/**
 * JACCARD SIMILARITY (Pure Function)
 * Optimized with early exit for empty sets
 */
export const getJaccard = (a, b) => {
  if (!a?.size || !b?.size) return 0;

  let intersection = 0;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;

  for (const x of smaller) {
    if (larger.has(x)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
};
