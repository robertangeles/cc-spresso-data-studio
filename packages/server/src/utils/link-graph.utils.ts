/**
 * Pure graph utilities for Model Studio layer-links + attribute-links.
 *
 * These functions operate on id-only edge lists — no DB access, no
 * layer/name enrichment. Callers (the layer-link and attribute-link
 * services) fetch edges from Postgres, pass them through these, and
 * then enrich the graph walk with whatever denormalised fields the
 * response needs (entity names, layers, etc.).
 *
 * Why pure: both layer_links and attribute_links share identical graph
 * semantics — a directed acyclic multigraph with a "no cycle on insert"
 * invariant. DRY the graph logic; let the services own the I/O.
 *
 * ASCII reference — the three graph shapes the tests cover:
 *
 *   Chain           Diamond (multi-parent + multi-child)   Multi-root
 *   (simple):       (legitimate: one logical from          (legitimate:
 *                    two conceptuals, projected to          one logical
 *                    two physicals — partitioned fact):     projected
 *                                                           from two
 *                                                           conceptuals):
 *   A               A ───▶ B                                A ────┐
 *   │               │      │                                      │
 *   ▼               ▼      ▼                                      ▼
 *   B               C ───▶ D                                      C
 *   │                                                      B ─────┘
 *   ▼                         A, C: parents of B, D
 *   C                         B, D: children of A, C
 *                                                          A, B: parents of C
 *                                                          C: child of both
 */

/** Minimal edge shape. Callers (layer-links / attribute-links services)
 *  can pass their own row type as long as it carries these two fields.
 *  We intentionally do NOT encode the link's own id in the edge because
 *  this utility deals in graph topology, not row identity. */
export interface LinkEdge {
  parentId: string;
  childId: string;
}

/** Per-node adjacency in the graph walk result. Both lists are filtered
 *  to the connected component returned by `resolveChain` — a parent on
 *  the wider graph that wasn't reached (e.g. past `maxDepth`) does NOT
 *  appear here, to avoid the UI rendering edges to nodes it doesn't have
 *  row data for. */
export interface ChainAdjacency {
  parentIds: string[];
  childIds: string[];
}

/** Shape returned by `resolveChain`. Adjacency list, not recursive tree,
 *  for two reasons: (1) the server can build it directly from a
 *  recursive CTE's flat rows, no re-nesting needed; (2) the client can
 *  look up by id for the breadcrumb cheaper on a flat shape. Matches
 *  the shape of `ProjectionChainResponse` from `@cc/shared`. */
export interface LinkGraph {
  rootId: string;
  nodeIds: string[];
  adjacency: Record<string, ChainAdjacency>;
}

/**
 * Returns `true` when adding `(newParentId → newChildId)` to the
 * existing edge set would create a cycle.
 *
 * Algorithm: BFS from `newChildId` following FORWARD edges (i.e. child
 * → its children → ...). If the walk reaches `newParentId`, the new edge
 * would close the cycle `newParent → newChild → ... → newParent`.
 *
 * Self-loop short-circuit: `newParentId === newChildId` is always a
 * cycle and returns `true` without building the adjacency map.
 *
 * Complexity: O(V + E) where V, E are the reachable subgraph from
 * `newChildId`. Typical data-model link graphs are small (<100 edges
 * per model), so the constant factor is irrelevant.
 *
 * Race-safety note: this function is PURE — soundness depends on the
 * caller reading `edges` inside the same SERIALIZABLE transaction that
 * inserts the new edge. A concurrent tab's mirror-link insert observed
 * with READ COMMITTED would race past the check; that's what the
 * service-level SERIALIZABLE + retry-on-40001 wrapper prevents. See
 * `model-studio-layer-links.service.ts` for the wrapper.
 */
export function detectCycle(
  edges: readonly LinkEdge[],
  newParentId: string,
  newChildId: string,
): boolean {
  if (newParentId === newChildId) return true;

  // Forward adjacency: parentId → [childId, childId, ...]
  const forwardAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = forwardAdj.get(edge.parentId);
    if (existing) {
      existing.push(edge.childId);
    } else {
      forwardAdj.set(edge.parentId, [edge.childId]);
    }
  }

  // BFS from newChildId. If we reach newParentId via forward edges,
  // the new (newParentId → newChildId) edge would close a cycle.
  const visited = new Set<string>();
  const queue: string[] = [newChildId];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === newParentId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    const children = forwardAdj.get(node);
    if (children) {
      for (const child of children) {
        if (!visited.has(child)) queue.push(child);
      }
    }
  }
  return false;
}

/**
 * Walks the connected component containing `rootId` and returns the
 * adjacency-list shape for the projection-chain response. Walks BOTH
 * directions from the root: upward (parents via reverse edges) and
 * downward (children via forward edges), each capped at `maxDepth` hops.
 *
 * For Step 7, `maxDepth` defaults to `3` because we have exactly three
 * layers (conceptual → logical → physical) and per-layer direct links
 * means any projection chain is at most 2 hops. The extra hop is
 * slack — enforces the boundary without being surprising.
 *
 * Cycle tolerance: even though `detectCycle` prevents cycles on insert,
 * this function is defensive — if a cycle ever slips in (bug in the
 * service, concurrent-delete race, manual DB edit), the `downVisited` /
 * `upVisited` sets guarantee termination. Worst case the BFS returns
 * the full strongly-connected component once and stops.
 *
 * Adjacency filter: `parentIds` and `childIds` on each returned node
 * are filtered to the connected-component set, so a parent that exists
 * in the wider graph but sits beyond `maxDepth` does NOT appear in the
 * adjacency — preventing the client from rendering a dangling edge.
 */
export function resolveChain(
  edges: readonly LinkEdge[],
  rootId: string,
  maxDepth: number = 3,
): LinkGraph {
  // Build both directions once.
  const forwardAdj = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const f = forwardAdj.get(edge.parentId);
    if (f) f.push(edge.childId);
    else forwardAdj.set(edge.parentId, [edge.childId]);

    const r = reverseAdj.get(edge.childId);
    if (r) r.push(edge.parentId);
    else reverseAdj.set(edge.childId, [edge.parentId]);
  }

  const reachable = new Set<string>([rootId]);

  // BFS downward from root. Tuple = [nodeId, depth].
  const downQueue: Array<[string, number]> = [[rootId, 0]];
  const downVisited = new Set<string>([rootId]);
  while (downQueue.length > 0) {
    const [node, depth] = downQueue.shift()!;
    if (depth >= maxDepth) continue;
    const children = forwardAdj.get(node);
    if (!children) continue;
    for (const child of children) {
      reachable.add(child);
      if (!downVisited.has(child)) {
        downVisited.add(child);
        downQueue.push([child, depth + 1]);
      }
    }
  }

  // BFS upward from root.
  const upQueue: Array<[string, number]> = [[rootId, 0]];
  const upVisited = new Set<string>([rootId]);
  while (upQueue.length > 0) {
    const [node, depth] = upQueue.shift()!;
    if (depth >= maxDepth) continue;
    const parents = reverseAdj.get(node);
    if (!parents) continue;
    for (const parent of parents) {
      reachable.add(parent);
      if (!upVisited.has(parent)) {
        upVisited.add(parent);
        upQueue.push([parent, depth + 1]);
      }
    }
  }

  // Emit adjacency restricted to the connected component so clients
  // never receive an edge pointing at a node they don't have data for.
  const adjacency: Record<string, ChainAdjacency> = {};
  for (const id of reachable) {
    adjacency[id] = {
      parentIds: (reverseAdj.get(id) ?? []).filter((p) => reachable.has(p)),
      childIds: (forwardAdj.get(id) ?? []).filter((c) => reachable.has(c)),
    };
  }

  return {
    rootId,
    nodeIds: Array.from(reachable),
    adjacency,
  };
}
