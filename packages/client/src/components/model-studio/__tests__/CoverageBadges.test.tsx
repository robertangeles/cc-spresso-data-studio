// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CoverageBadges } from '../CoverageBadges';

afterEach(() => cleanup());

describe('CoverageBadges', () => {
  it('renders three pills in C / L / P order', () => {
    render(
      <CoverageBadges
        cell={{ conceptual: true, logical: true, physical: true }}
        ownLayer="logical"
      />,
    );
    expect(screen.getByTestId('coverage-badge-conceptual').textContent).toBe('C');
    expect(screen.getByTestId('coverage-badge-logical').textContent).toBe('L');
    expect(screen.getByTestId('coverage-badge-physical').textContent).toBe('P');
  });

  it('marks present layers with data-present="true"', () => {
    render(
      <CoverageBadges
        cell={{ conceptual: true, logical: false, physical: true }}
        ownLayer="conceptual"
      />,
    );
    expect(screen.getByTestId('coverage-badge-conceptual').getAttribute('data-present')).toBe(
      'true',
    );
    expect(screen.getByTestId('coverage-badge-logical').getAttribute('data-present')).toBe('false');
    expect(screen.getByTestId('coverage-badge-physical').getAttribute('data-present')).toBe('true');
  });

  it('marks the own-layer pill with data-own="true"', () => {
    render(
      <CoverageBadges
        cell={{ conceptual: false, logical: true, physical: false }}
        ownLayer="logical"
      />,
    );
    expect(screen.getByTestId('coverage-badge-conceptual').getAttribute('data-own')).toBe('false');
    expect(screen.getByTestId('coverage-badge-logical').getAttribute('data-own')).toBe('true');
    expect(screen.getByTestId('coverage-badge-physical').getAttribute('data-own')).toBe('false');
  });

  it('falls back to all-dim when cell is undefined', () => {
    render(<CoverageBadges cell={undefined} ownLayer="logical" />);
    expect(screen.getByTestId('coverage-badge-conceptual').getAttribute('data-present')).toBe(
      'false',
    );
    expect(screen.getByTestId('coverage-badge-logical').getAttribute('data-present')).toBe('false');
    expect(screen.getByTestId('coverage-badge-physical').getAttribute('data-present')).toBe(
      'false',
    );
  });

  it('exposes accessible aria-labels reflecting present + own state', () => {
    render(
      <CoverageBadges
        cell={{ conceptual: true, logical: true, physical: false }}
        ownLayer="logical"
      />,
    );
    expect(screen.getByTestId('coverage-badge-logical').getAttribute('aria-label')).toBe(
      'Logical: projected (current layer)',
    );
    expect(screen.getByTestId('coverage-badge-conceptual').getAttribute('aria-label')).toBe(
      'Conceptual: projected',
    );
    expect(screen.getByTestId('coverage-badge-physical').getAttribute('aria-label')).toBe(
      'Physical: not projected',
    );
  });
});
