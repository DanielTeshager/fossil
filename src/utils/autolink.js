// --- Auto-Linking Service ---

import { tokenize, getJaccard } from './tokenizer.js';

/**
 * Find fossils related to a given fossil based on semantic similarity
 */
export const findRelatedFossils = (targetFossil, allFossils, tokenIndex, options = {}) => {
  const {
    minSimilarity = 0.15,
    maxResults = 5,
    excludeChain = true
  } = options;

  const targetTokens = tokenIndex.get(targetFossil.id) || tokenize(targetFossil.invariant || '');

  // Get chain members to exclude
  const chainIds = new Set();
  if (excludeChain) {
    // Find all descendants
    const findDescendants = (id) => {
      chainIds.add(id);
      allFossils.forEach(f => {
        if (f.reentryOf === id && !f.deleted) {
          findDescendants(f.id);
        }
      });
    };

    // Find root and then all descendants
    let root = targetFossil;
    while (root.reentryOf) {
      const parent = allFossils.find(f => f.id === root.reentryOf);
      if (parent) root = parent;
      else break;
    }
    findDescendants(root.id);
  }

  const related = [];

  for (const fossil of allFossils) {
    if (fossil.id === targetFossil.id || fossil.deleted || fossil.supersededBy) continue;
    if (excludeChain && chainIds.has(fossil.id)) continue;

    const fossilTokens = tokenIndex.get(fossil.id) || tokenize(fossil.invariant || '');
    const similarity = getJaccard(targetTokens, fossilTokens);

    if (similarity >= minSimilarity) {
      related.push({
        fossil,
        similarity: Math.round(similarity * 100),
        sharedConcepts: getSharedConcepts(targetTokens, fossilTokens)
      });
    }
  }

  return related
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
};

/**
 * Get shared concepts between two token sets
 */
const getSharedConcepts = (tokensA, tokensB) => {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shared = [];

  for (const token of setA) {
    if (setB.has(token) && token.length > 3) {
      shared.push(token);
    }
  }

  return shared.slice(0, 5);
};

/**
 * Detect knowledge clusters - groups of related fossils
 */
export const detectClusters = (fossils, tokenIndex, options = {}) => {
  const { minClusterSize = 3, minSimilarity = 0.2 } = options;

  const validFossils = fossils.filter(f => !f.deleted && !f.supersededBy);
  if (validFossils.length < minClusterSize) return [];

  // Build adjacency based on similarity
  const adjacency = new Map();

  for (let i = 0; i < validFossils.length; i++) {
    const fossilA = validFossils[i];
    const tokensA = tokenIndex.get(fossilA.id) || tokenize(fossilA.invariant || '');
    const neighbors = [];

    for (let j = 0; j < validFossils.length; j++) {
      if (i === j) continue;
      const fossilB = validFossils[j];
      const tokensB = tokenIndex.get(fossilB.id) || tokenize(fossilB.invariant || '');
      const similarity = getJaccard(tokensA, tokensB);

      if (similarity >= minSimilarity) {
        neighbors.push({ id: fossilB.id, similarity });
      }
    }

    adjacency.set(fossilA.id, neighbors);
  }

  // Find connected components using BFS
  const visited = new Set();
  const clusters = [];

  for (const fossil of validFossils) {
    if (visited.has(fossil.id)) continue;

    const cluster = [];
    const queue = [fossil.id];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.id)) {
          queue.push(neighbor.id);
        }
      }
    }

    if (cluster.length >= minClusterSize) {
      // Find cluster theme by most common tokens
      const clusterFossils = cluster.map(id => validFossils.find(f => f.id === id));
      const tokenFreq = new Map();

      for (const f of clusterFossils) {
        const tokens = tokenIndex.get(f.id) || tokenize(f.invariant || '');
        for (const token of tokens) {
          if (token.length > 3) {
            tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
          }
        }
      }

      const theme = [...tokenFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word);

      clusters.push({
        ids: cluster,
        size: cluster.length,
        theme,
        fossils: clusterFossils
      });
    }
  }

  return clusters.sort((a, b) => b.size - a.size);
};

/**
 * Suggest potential connections for graph view
 */
export const suggestConnections = (fossils, tokenIndex, existingEdges = []) => {
  const suggestions = [];
  const existingPairs = new Set(existingEdges.map(e => `${e.source}-${e.target}`));

  const validFossils = fossils.filter(f => !f.deleted && !f.supersededBy);

  for (let i = 0; i < validFossils.length; i++) {
    const fossilA = validFossils[i];
    const tokensA = tokenIndex.get(fossilA.id) || tokenize(fossilA.invariant || '');

    for (let j = i + 1; j < validFossils.length; j++) {
      const fossilB = validFossils[j];

      // Skip if already connected by reentry
      if (fossilA.reentryOf === fossilB.id || fossilB.reentryOf === fossilA.id) continue;

      // Skip if already has manual edge
      const pairKey1 = `${fossilA.id}-${fossilB.id}`;
      const pairKey2 = `${fossilB.id}-${fossilA.id}`;
      if (existingPairs.has(pairKey1) || existingPairs.has(pairKey2)) continue;

      const tokensB = tokenIndex.get(fossilB.id) || tokenize(fossilB.invariant || '');
      const similarity = getJaccard(tokensA, tokensB);

      // High similarity but not connected = suggestion
      if (similarity >= 0.25 && similarity < 0.7) {
        const shared = getSharedConcepts(tokensA, tokensB);
        if (shared.length >= 2) {
          suggestions.push({
            sourceId: fossilA.id,
            targetId: fossilB.id,
            similarity: Math.round(similarity * 100),
            reason: `Share concepts: ${shared.join(', ')}`,
            sharedConcepts: shared
          });
        }
      }
    }
  }

  return suggestions
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);
};

/**
 * Find cross-domain insights - fossils that bridge different topic clusters
 */
export const findBridgeFossils = (fossils, tokenIndex) => {
  const clusters = detectClusters(fossils, tokenIndex, { minClusterSize: 2, minSimilarity: 0.25 });
  if (clusters.length < 2) return [];

  const bridges = [];
  const validFossils = fossils.filter(f => !f.deleted && !f.supersededBy);

  for (const fossil of validFossils) {
    const tokens = tokenIndex.get(fossil.id) || tokenize(fossil.invariant || '');
    const clusterConnections = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      let maxSim = 0;

      for (const clusterFossil of cluster.fossils) {
        if (clusterFossil.id === fossil.id) continue;
        const clusterTokens = tokenIndex.get(clusterFossil.id) || tokenize(clusterFossil.invariant || '');
        const sim = getJaccard(tokens, clusterTokens);
        maxSim = Math.max(maxSim, sim);
      }

      if (maxSim >= 0.15) {
        clusterConnections.push({ cluster: i, theme: cluster.theme, similarity: maxSim });
      }
    }

    // Bridge fossil connects 2+ clusters
    if (clusterConnections.length >= 2) {
      bridges.push({
        fossil,
        connections: clusterConnections,
        bridgeStrength: clusterConnections.reduce((sum, c) => sum + c.similarity, 0) / clusterConnections.length
      });
    }
  }

  return bridges.sort((a, b) => b.bridgeStrength - a.bridgeStrength).slice(0, 5);
};
