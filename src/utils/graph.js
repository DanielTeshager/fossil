// --- Graph Building & Layout ---

import { SEMANTIC_EDGE_THRESHOLD } from './constants.js';
import { getJaccard } from './tokenizer.js';

/**
 * Build graph data from fossils
 */
export const buildGraphData = (fossils, tokenIndex) => {
  const nodes = [];
  const edges = [];
  const visibleFossils = fossils.filter(f => !f.deleted);

  // Build nodes
  for (const fossil of visibleFossils) {
    nodes.push({
      id: fossil.id,
      size: 8 + ((fossil.quality || 2) * 4) + ((fossil.reuseCount || 0) * 2),
      label: (fossil.invariant || '').slice(0, 35) + ((fossil.invariant || '').length > 35 ? '...' : ''),
      fossil,
      cluster: 0
    });
  }

  // Build edges
  for (let i = 0; i < visibleFossils.length; i++) {
    const fA = visibleFossils[i];

    // Reentry edges (explicit connections)
    if (fA.reentryOf) {
      const parentExists = visibleFossils.some(f => f.id === fA.reentryOf);
      if (parentExists) {
        edges.push({
          source: fA.id,
          target: fA.reentryOf,
          type: 'reentry',
          weight: 1.0
        });
      }
    }

    // Semantic edges (implicit connections)
    const tokensA = tokenIndex.get(fA.id);
    for (let j = i + 1; j < visibleFossils.length; j++) {
      const fB = visibleFossils[j];
      if (fA.reentryOf === fB.id || fB.reentryOf === fA.id) continue;

      const tokensB = tokenIndex.get(fB.id);
      const similarity = getJaccard(tokensA, tokensB);

      if (similarity >= SEMANTIC_EDGE_THRESHOLD) {
        edges.push({
          source: fA.id,
          target: fB.id,
          type: 'semantic',
          weight: similarity
        });
      }
    }
  }

  // Assign clusters using connected components
  const visited = new Set();
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const adjacency = new Map();

  edges.forEach(e => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source).push(e.target);
    adjacency.get(e.target).push(e.source);
  });

  let clusterIdx = 0;
  const dfs = (nodeId, cluster) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    if (nodeMap[nodeId]) nodeMap[nodeId].cluster = cluster;
    (adjacency.get(nodeId) || []).forEach(neighbor => dfs(neighbor, cluster));
  };

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      dfs(node.id, clusterIdx);
      clusterIdx++;
    }
  });

  return { nodes, edges, clusterCount: clusterIdx };
};

/**
 * Force-directed layout algorithm
 */
export const layoutGraph = (nodes, edges, width = 600, height = 400, iterations = 80) => {
  if (nodes.length === 0) return nodes;

  // Initialize positions
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = Math.min(width, height) * 0.35;
    node.x = width / 2 + radius * Math.cos(angle);
    node.y = height / 2 + radius * Math.sin(angle);
  });

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;

    // Repulsion between all nodes
    for (const nodeA of nodes) {
      let fx = 0, fy = 0;
      for (const nodeB of nodes) {
        if (nodeA.id === nodeB.id) continue;

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 800 / (dist * dist);

        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      nodeA.vx = (nodeA.vx || 0) + fx * temperature;
      nodeA.vy = (nodeA.vy || 0) + fy * temperature;
    }

    // Attraction along edges
    for (const edge of edges) {
      const nodeA = nodeMap[edge.source];
      const nodeB = nodeMap[edge.target];
      if (!nodeA || !nodeB) continue;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = dist * 0.02 * edge.weight;

      nodeA.vx = (nodeA.vx || 0) + (dx / dist) * force * temperature;
      nodeA.vy = (nodeA.vy || 0) + (dy / dist) * force * temperature;
      nodeB.vx = (nodeB.vx || 0) - (dx / dist) * force * temperature;
      nodeB.vy = (nodeB.vy || 0) - (dy / dist) * force * temperature;
    }

    // Apply velocities with damping
    nodes.forEach(node => {
      node.x += (node.vx || 0) * 0.1;
      node.y += (node.vy || 0) * 0.1;
      node.vx = (node.vx || 0) * 0.8;
      node.vy = (node.vy || 0) * 0.8;
    });
  }

  // Normalize to viewport with padding
  const padding = 40;
  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));

  const scaleX = (maxX - minX) > 0 ? (width - padding * 2) / (maxX - minX) : 1;
  const scaleY = (maxY - minY) > 0 ? (height - padding * 2) / (maxY - minY) : 1;
  const scale = Math.min(scaleX, scaleY, 1);

  nodes.forEach(node => {
    node.x = padding + (node.x - minX) * scale;
    node.y = padding + (node.y - minY) * scale;
    delete node.vx;
    delete node.vy;
  });

  return nodes;
};
