// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
import type { Cardinality, Notation } from '@cc/shared';
import {
  RelationshipEdge,
  type RelationshipEdgeData,
  ieSymbol,
  idef1xSymbol,
  selfRefPath,
} from '../RelationshipEdge';
import { Position, ReactFlowProvider } from '@xyflow/react';

/**
 * S6-U18 / S6-U19 / S6-U20 — visual regression snapshots for the
 * IE + IDEF1X symbol pairs and the self-ref arc geometry.
 *
 * Approach: wrap the edge in a minimal SVG + ReactFlowProvider so
 * `EdgeLabelRenderer` has a container to portal into. We snapshot the
 * <g> element directly — pure SVG markup, deterministic across runs.
 */

const CARDINALITIES: Cardinality[] = ['one', 'many', 'zero_or_one', 'zero_or_many', 'one_or_many'];

function renderEdge(data: RelationshipEdgeData) {
  // React Flow expects edges to be rendered inside a flow provider so
  // `EdgeLabelRenderer` has a host div. We put the edge inside an
  // <svg>.
  return render(
    <ReactFlowProvider>
      <svg width={800} height={400}>
        <RelationshipEdge
          id="edge-test"
          source="src"
          target="tgt"
          sourceX={100}
          sourceY={200}
          targetX={400}
          targetY={200}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          data={data as unknown as Record<string, unknown>}
          selected={false}
          animated={false}
          type="relationship"
          style={{}}
          markerEnd={undefined}
          markerStart={undefined}
          label={undefined}
          labelStyle={{}}
          labelShowBg={false}
          labelBgStyle={{}}
          labelBgPadding={[0, 0]}
          labelBgBorderRadius={0}
          sourceHandleId={null}
          targetHandleId={null}
          interactionWidth={20}
          pathOptions={undefined}
        />
      </svg>
    </ReactFlowProvider>,
  );
}

function baseData(
  notation: Notation,
  src: Cardinality,
  tgt: Cardinality,
  isIdentifying: boolean,
): RelationshipEdgeData {
  return {
    sourceCardinality: src,
    targetCardinality: tgt,
    isIdentifying,
    notation,
    isSelfRef: false,
    isNewlyCreated: false,
    sourceEntityId: 'ent-src',
    targetEntityId: 'ent-tgt',
    relId: 'rel-1',
  };
}

// ────────────────────────────────────────────────────────────────────
// Pure function tests — cheap, deterministic, no DOM required.
// ────────────────────────────────────────────────────────────────────

describe('ieSymbol — table-driven lookup', () => {
  it('maps `one` to bar-only', () => {
    expect(ieSymbol('one')).toEqual({
      bar: true,
      openCircle: false,
      filledCircle: false,
      crowsFoot: false,
    });
  });
  it('maps `many` to crows-foot-only', () => {
    expect(ieSymbol('many').crowsFoot).toBe(true);
    expect(ieSymbol('many').bar).toBe(false);
  });
  it('maps `zero_or_one` to bar + open circle', () => {
    const g = ieSymbol('zero_or_one');
    expect(g.bar).toBe(true);
    expect(g.openCircle).toBe(true);
  });
  it('maps `zero_or_many` to crows-foot + open circle', () => {
    const g = ieSymbol('zero_or_many');
    expect(g.crowsFoot).toBe(true);
    expect(g.openCircle).toBe(true);
  });
  it('maps `one_or_many` to crows-foot + bar', () => {
    const g = ieSymbol('one_or_many');
    expect(g.crowsFoot).toBe(true);
    expect(g.bar).toBe(true);
  });
});

describe('idef1xSymbol — table-driven lookup', () => {
  it('maps `one` to bar-only', () => {
    expect(idef1xSymbol('one').bar).toBe(true);
    expect(idef1xSymbol('one').filledCircle).toBe(false);
  });
  it('maps `many` to filled-circle', () => {
    expect(idef1xSymbol('many').filledCircle).toBe(true);
  });
  it('maps `zero_or_one` to bar + open circle', () => {
    expect(idef1xSymbol('zero_or_one').bar).toBe(true);
    expect(idef1xSymbol('zero_or_one').openCircle).toBe(true);
  });
  it('maps `zero_or_many` to filled-circle + open circle', () => {
    const g = idef1xSymbol('zero_or_many');
    expect(g.filledCircle).toBe(true);
    expect(g.openCircle).toBe(true);
  });
});

describe('selfRefPath — 3-segment orthogonal loop (S6-U20 Direction A)', () => {
  it('returns an SVG path starting with M and containing exactly three L commands', () => {
    // Direction A: self-ref now routes right-top(source)→right-bottom
    // (target) and draws a 3-segment orthogonal corridor. No curves.
    const path = selfRefPath(100, 200, 100, 260);
    expect(path).toMatch(/^M /);
    const lMatches = path.match(/ L /g) ?? [];
    expect(lMatches.length).toBe(3);
    // No bezier or arc commands — the corridor is strictly orthogonal.
    expect(path).not.toMatch(/ C /);
    expect(path).not.toMatch(/ A /);
  });

  it('ends at the target coordinates', () => {
    const path = selfRefPath(100, 200, 100, 260);
    expect(path.endsWith('100 260')).toBe(true);
  });

  it('every consecutive pair of points is axis-aligned (no diagonals)', () => {
    const path = selfRefPath(100, 200, 100, 260);
    // Parse the commands and their coordinates in order.
    const tokens = path.split(/[ML]\s+/).filter(Boolean);
    const points = tokens.map((t) => t.trim().split(/\s+/).map(Number) as [number, number]);
    expect(points.length).toBe(4); // M + 3 L
    for (let i = 1; i < points.length; i += 1) {
      const [px, py] = points[i - 1]!;
      const [qx, qy] = points[i]!;
      // Consecutive points must share EITHER x OR y (orthogonal).
      expect(px === qx || py === qy).toBe(true);
    }
  });

  it('is deterministic for a given source+target pair', () => {
    expect(selfRefPath(50, 50, 20, 20)).toBe(selfRefPath(50, 50, 20, 20));
  });
});

// ────────────────────────────────────────────────────────────────────
// Visual snapshots — 10 × IE variants + 10 × IDEF1X variants
// ────────────────────────────────────────────────────────────────────

describe('RelationshipEdge — IE visual snapshots (S6-U18)', () => {
  for (const src of CARDINALITIES) {
    for (const identifying of [true, false] as const) {
      // Fix target cardinality so we still get 5 × 2 = 10 variants
      // without combinatorial explosion. The src end is what varies
      // per case; the snapshot captures the rendered glyph markup.
      it(`IE src=${src} identifying=${identifying}`, () => {
        const { container } = renderEdge(baseData('ie', src, 'many', identifying));
        const root = container.querySelector('[data-testid="relationship-edge-edge-test"]');
        expect(root).toBeTruthy();
        expect(root?.outerHTML).toMatchSnapshot();
      });
    }
  }
});

describe('RelationshipEdge — IDEF1X visual snapshots (S6-U19)', () => {
  for (const src of CARDINALITIES) {
    for (const identifying of [true, false] as const) {
      it(`IDEF1X src=${src} identifying=${identifying}`, () => {
        const { container } = renderEdge(baseData('idef1x', src, 'one', identifying));
        const root = container.querySelector('[data-testid="relationship-edge-edge-test"]');
        expect(root).toBeTruthy();
        expect(root?.outerHTML).toMatchSnapshot();
      });
    }
  }
});

describe('RelationshipEdge — self-ref rendering (S6-U20 Direction A)', () => {
  it('renders a 3-segment orthogonal self-ref corridor when source === target', () => {
    const data = baseData('ie', 'one', 'many', false);
    data.isSelfRef = true;
    data.targetEntityId = data.sourceEntityId;
    const { container } = renderEdge(data);
    const root = container.querySelector('[data-testid="relationship-edge-edge-test"]');
    expect(root?.getAttribute('data-self-ref')).toBe('true');
    // Direction A: path is orthogonal — contains L commands, NOT C or A.
    const path = container.querySelector('path[d]');
    const d = path?.getAttribute('d') ?? '';
    expect(d).toMatch(/ L /);
    expect(d).not.toMatch(/ C /);
    expect(d).not.toMatch(/ A /);
  });
});

describe('RelationshipEdge — identifying stroke style', () => {
  it('non-identifying edge uses a dashed stroke pattern', () => {
    const { container } = renderEdge(baseData('ie', 'one', 'many', false));
    const paths = container.querySelectorAll('path');
    // Find the rendered edge path (BaseEdge uses first <path>).
    const styled = Array.from(paths).find((p) =>
      (p.getAttribute('style') ?? '').includes('stroke-dasharray'),
    );
    expect(styled).toBeTruthy();
  });

  it('identifying edge omits the dashed pattern', () => {
    const { container } = renderEdge(baseData('ie', 'one', 'many', true));
    const paths = container.querySelectorAll('path');
    const styled = Array.from(paths).find(
      (p) =>
        (p.getAttribute('style') ?? '').includes('stroke-dasharray') &&
        !(p.getAttribute('style') ?? '').includes('undefined'),
    );
    // Either: no dashed styling at all, or stroke-dasharray is
    // literally "undefined" (degrades to solid).
    const anyActuallyDashed = Array.from(paths).some((p) => {
      const style = p.getAttribute('style') ?? '';
      return style.includes('stroke-dasharray: 6 4');
    });
    expect(anyActuallyDashed).toBe(false);
    // Quiet unused-var lint when the filter above returned undefined.
    void styled;
  });

  it('identifying edge draws a thicker line than non-identifying (Direction A)', () => {
    // Per Direction A brief: identifying = 2.25, non-identifying = 1.4.
    const idRender = renderEdge(baseData('ie', 'one', 'many', true));
    const nonIdRender = renderEdge(baseData('ie', 'one', 'many', false));
    const idStyle =
      idRender.container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ?? '';
    const nonIdStyle =
      nonIdRender.container.querySelector('path.react-flow__edge-path')?.getAttribute('style') ??
      '';
    expect(idStyle).toMatch(/stroke-width:\s*2\.25/);
    expect(nonIdStyle).toMatch(/stroke-width:\s*1\.4/);
  });
});

// Cardinality text labels were intentionally removed from the diagram
// render — the cardinality glyph (crow's foot, bar, circle) is the
// cardinality in IE/IDEF1X notation, and duplicating it as text
// clutters dense canvases + overlaps verb phrases. The shared
// `formatCardinalityText` util is still exported for the properties
// panel + DDL export to consume. See
// packages/shared/src/__tests__/cardinality-text.test.ts for the util
// unit tests.

describe('RelationshipEdge — verb phrases (Direction A)', () => {
  // EdgeLabelRenderer portals its children into React Flow's viewport
  // div, so the labels live in document.body (not inside our test
  // container). Use `screen` / `document` to assert visibility.

  it('renders forward AND inverse labels when both are set', () => {
    const data = baseData('ie', 'one', 'many', true);
    data.verbForward = 'manages';
    data.verbInverse = 'is_managed_by';
    renderEdge(data);
    const forward = screen.queryByTestId('rel-verb-forward-edge-test');
    const inverse = screen.queryByTestId('rel-verb-inverse-edge-test');
    expect(forward).toBeTruthy();
    expect(inverse).toBeTruthy();
    expect(forward?.textContent).toBe('manages');
    expect(inverse?.textContent).toBe('is_managed_by');
  });

  it('renders a single centred label when only forward is set', () => {
    const data = baseData('ie', 'one', 'many', true);
    data.verbForward = 'manages';
    data.verbInverse = null;
    renderEdge(data);
    expect(screen.queryByTestId('rel-verb-single-edge-test')).toBeTruthy();
    expect(screen.queryByTestId('rel-verb-forward-edge-test')).toBeFalsy();
    expect(screen.queryByTestId('rel-verb-inverse-edge-test')).toBeFalsy();
  });

  it('renders nothing when neither verb is set', () => {
    const data = baseData('ie', 'one', 'many', true);
    data.verbForward = null;
    data.verbInverse = null;
    renderEdge(data);
    expect(screen.queryByTestId('rel-verb-single-edge-test')).toBeFalsy();
    expect(screen.queryByTestId('rel-verb-forward-edge-test')).toBeFalsy();
    expect(screen.queryByTestId('rel-verb-inverse-edge-test')).toBeFalsy();
  });
});
