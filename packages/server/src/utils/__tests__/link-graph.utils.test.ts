import { describe, it, expect } from 'vitest';
import { detectCycle, resolveChain, type LinkEdge } from '../link-graph.utils.js';

/**
 * Tests for the pure graph utility powering layer-link + attribute-link
 * cycle detection and projection-chain resolution. The service layer
 * owns SERIALIZABLE-transaction race safety; these tests cover
 * topological soundness only.
 */

// Shorthand builder: `e('A', 'B')` = edge A→B. Keeps test graphs readable.
const e = (parentId: string, childId: string): LinkEdge => ({ parentId, childId });

describe('detectCycle', () => {
  it('returns true for a self-loop (newParent === newChild)', () => {
    // Self-loop is always a cycle, independent of existing edges.
    expect(detectCycle([], 'A', 'A')).toBe(true);
    expect(detectCycle([e('B', 'C')], 'A', 'A')).toBe(true);
  });

  it('returns false on an empty graph when the new edge is between distinct nodes', () => {
    expect(detectCycle([], 'A', 'B')).toBe(false);
  });

  it('returns true when adding C→A would close a simple chain A→B→C', () => {
    // A → B → C, add C → A  ⇒  A → B → C → A (cycle)
    const edges = [e('A', 'B'), e('B', 'C')];
    expect(detectCycle(edges, 'C', 'A')).toBe(true);
  });

  it('returns false for a legitimate multi-parent insert (two conceptuals → one logical)', () => {
    // A → C already exists. Adding B → C is valid (C has two parents).
    const edges = [e('A', 'C')];
    expect(detectCycle(edges, 'B', 'C')).toBe(false);
  });

  it('returns false for a legitimate multi-child insert (one logical → two physicals)', () => {
    // A → B already exists. Adding A → C is valid (A has two children).
    const edges = [e('A', 'B')];
    expect(detectCycle(edges, 'A', 'C')).toBe(false);
  });

  it('returns true for a cycle through a diamond (A→B, A→C, B→D, C→D; add D→A)', () => {
    // Diamond reaches D from A by two paths. Adding D → A closes both.
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')];
    expect(detectCycle(edges, 'D', 'A')).toBe(true);
  });

  it('returns false when an insert connects two disjoint components', () => {
    // {A→B} and {C→D} are disjoint. Adding B → C bridges them; no cycle.
    const edges = [e('A', 'B'), e('C', 'D')];
    expect(detectCycle(edges, 'B', 'C')).toBe(false);
  });

  it('returns true when the cycle requires walking multiple hops forward', () => {
    // Long chain: A → B → C → D → E. Adding E → A is a 5-hop cycle.
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'D'), e('D', 'E')];
    expect(detectCycle(edges, 'E', 'A')).toBe(true);
  });

  it('terminates and returns false on a cycle-present graph (defensive)', () => {
    // The service should never call us with a pre-existing cycle in the
    // graph, but if it does (bug, manual DB edit), the visited-set guard
    // MUST terminate. We add a new edge that wouldn't extend the cycle
    // and check the function returns a boolean in finite time.
    const edges = [e('A', 'B'), e('B', 'A')]; // pre-existing cycle
    const t0 = Date.now();
    const result = detectCycle(edges, 'C', 'D');
    const elapsed = Date.now() - t0;
    expect(result).toBe(false);
    expect(elapsed).toBeLessThan(100); // 100ms is generous for a 2-edge graph
  });
});

describe('resolveChain', () => {
  it('resolves a simple linear chain walked from the middle', () => {
    // A → B → C, root = B. Expect all three nodes; edges in both directions.
    const edges = [e('A', 'B'), e('B', 'C')];
    const result = resolveChain(edges, 'B');

    expect(result.rootId).toBe('B');
    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(result.adjacency.A).toEqual({ parentIds: [], childIds: ['B'] });
    expect(result.adjacency.B).toEqual({ parentIds: ['A'], childIds: ['C'] });
    expect(result.adjacency.C).toEqual({ parentIds: ['B'], childIds: [] });
  });

  it('returns only the root when the entity has no links', () => {
    // Root isolated; no edges in the graph at all.
    const result = resolveChain([], 'X');

    expect(result.rootId).toBe('X');
    expect(result.nodeIds).toEqual(['X']);
    expect(result.adjacency.X).toEqual({ parentIds: [], childIds: [] });
  });

  it('resolves a multi-parent DAG (one logical from two conceptuals)', () => {
    // A → C, B → C. Root = C: should see both A and B as parents.
    const edges = [e('A', 'C'), e('B', 'C')];
    const result = resolveChain(edges, 'C');

    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(new Set(result.adjacency.C.parentIds)).toEqual(new Set(['A', 'B']));
    expect(result.adjacency.C.childIds).toEqual([]);
    expect(result.adjacency.A).toEqual({ parentIds: [], childIds: ['C'] });
    expect(result.adjacency.B).toEqual({ parentIds: [], childIds: ['C'] });
  });

  it('resolves a multi-child DAG (one logical to two physicals)', () => {
    // A → B, A → C. Root = A: should see both B and C as children.
    const edges = [e('A', 'B'), e('A', 'C')];
    const result = resolveChain(edges, 'A');

    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(new Set(result.adjacency.A.childIds)).toEqual(new Set(['B', 'C']));
    expect(result.adjacency.A.parentIds).toEqual([]);
  });

  it('resolves a full diamond from any starting point', () => {
    // A → B, A → C, B → D, C → D. Root = D: walks up to A via both B and C.
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')];
    const result = resolveChain(edges, 'D');

    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(new Set(result.adjacency.D.parentIds)).toEqual(new Set(['B', 'C']));
    expect(new Set(result.adjacency.A.childIds)).toEqual(new Set(['B', 'C']));
  });

  it('caps the walk at maxDepth in both directions', () => {
    // Chain A → B → C → D → E. Root = C with maxDepth = 1 should see
    // only B, C, D (direct neighbours). A and E are two hops away.
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'D'), e('D', 'E')];
    const result = resolveChain(edges, 'C', 1);

    expect(new Set(result.nodeIds)).toEqual(new Set(['B', 'C', 'D']));
    // Adjacency filter excludes out-of-reachable edges: C's parent A
    // and child E aren't in the set so they're filtered out.
    expect(result.adjacency.B).toEqual({ parentIds: [], childIds: ['C'] });
    expect(result.adjacency.D).toEqual({ parentIds: ['C'], childIds: [] });
  });

  it('terminates and returns a bounded graph on a cycle-present input (defensive)', () => {
    // Cycle A → B → A. Root = A. Even with a cycle, we must return
    // the connected component once and stop.
    const edges = [e('A', 'B'), e('B', 'A')];
    const result = resolveChain(edges, 'A');

    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B']));
    // Each node appears in both directions of the cycle:
    expect(new Set(result.adjacency.A.parentIds)).toEqual(new Set(['B']));
    expect(new Set(result.adjacency.A.childIds)).toEqual(new Set(['B']));
    expect(new Set(result.adjacency.B.parentIds)).toEqual(new Set(['A']));
    expect(new Set(result.adjacency.B.childIds)).toEqual(new Set(['A']));
  });

  it('does not include disjoint components in the result', () => {
    // Two disjoint chains: {A → B} and {C → D}. Root = A should not
    // drag C or D into the result even though they exist in `edges`.
    const edges = [e('A', 'B'), e('C', 'D')];
    const result = resolveChain(edges, 'A');

    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B']));
    expect(result.adjacency.C).toBeUndefined();
    expect(result.adjacency.D).toBeUndefined();
  });

  it('defaults maxDepth to 3 — enough for the 3-layer Model Studio case', () => {
    // Chain A → B → C → D → E (4 hops end-to-end). Root = A with default
    // maxDepth = 3 should reach D but not E downward.
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'D'), e('D', 'E')];
    const result = resolveChain(edges, 'A');

    expect(new Set(result.nodeIds)).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(result.adjacency.E).toBeUndefined();
  });
});
