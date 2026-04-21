// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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

describe('selfRefPath — arc geometry (S6-U20)', () => {
  it('returns an SVG path starting with M and containing a cubic (C) bezier', () => {
    // Self-ref now routes right(source)→top(target) and draws a single
    // cubic bezier D-loop between them — see selfRefPath for geometry.
    const path = selfRefPath(100, 200, 60, 160);
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ C /);
  });

  it('start + end points differ — self-ref must not be a zero-length curve', () => {
    const path = selfRefPath(100, 200, 60, 160);
    // Path must END at the target coords, not the source.
    expect(path.endsWith('60 160')).toBe(true);
    expect(path.endsWith('100 200')).toBe(false);
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

describe('RelationshipEdge — self-ref rendering (S6-U20)', () => {
  it('renders a self-ref cubic-bezier path when source === target', () => {
    const data = baseData('ie', 'one', 'many', false);
    data.isSelfRef = true;
    data.targetEntityId = data.sourceEntityId;
    const { container } = renderEdge(data);
    const root = container.querySelector('[data-testid="relationship-edge-edge-test"]');
    expect(root?.getAttribute('data-self-ref')).toBe('true');
    // selfRefPath now draws a single cubic bezier D-loop between the
    // `right` source handle and the `top` target handle — check for
    // the C (cubic) command, not A (arc). See selfRefPath geometry.
    const path = container.querySelector('path[d]');
    const d = path?.getAttribute('d') ?? '';
    expect(d).toMatch(/ C /);
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
});
