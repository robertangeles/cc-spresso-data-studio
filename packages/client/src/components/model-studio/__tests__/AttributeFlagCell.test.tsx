// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AttributeFlagCell } from '../AttributeFlagCell';

afterEach(() => cleanup());

/**
 * AttributeFlagCell — Step 6 Direction A. Five smoke cases covering
 * every flag combination a senior modeller reads in Erwin / ER
 * Studio: PK alone, BK alone, PK + BK, FK, and NN + UQ. Assertions
 * use explicit `getByText` per the brief.
 */

describe('AttributeFlagCell', () => {
  it('PK alone renders just "PK"', () => {
    render(<AttributeFlagCell isPk isFk={false} isNn={false} isUq={false} altKeyGroup={null} />);
    expect(screen.getByText('PK')).toBeTruthy();
    expect(screen.queryByText('FK')).toBeNull();
    expect(screen.queryByText('NN')).toBeNull();
    expect(screen.queryByText('UQ')).toBeNull();
  });

  it('BK alone (AK1) renders just the AK label', () => {
    render(
      <AttributeFlagCell isPk={false} isFk={false} isNn={false} isUq={false} altKeyGroup="AK1" />,
    );
    expect(screen.getByText('AK1')).toBeTruthy();
    expect(screen.queryByText('PK')).toBeNull();
  });

  it('PK + BK renders both', () => {
    render(<AttributeFlagCell isPk isFk={false} isNn={false} isUq={false} altKeyGroup="AK1" />);
    expect(screen.getByText('PK')).toBeTruthy();
    expect(screen.getByText('AK1')).toBeTruthy();
  });

  it('FK renders the FK code', () => {
    render(<AttributeFlagCell isPk={false} isFk isNn={false} isUq={false} altKeyGroup={null} />);
    expect(screen.getByText('FK')).toBeTruthy();
    expect(screen.queryByText('PK')).toBeNull();
  });

  it('AK badge tooltip shows "AK1 — <label>" when altKeyLabel is provided', () => {
    render(
      <AttributeFlagCell isPk={false} isFk={false} altKeyGroup="AK1" altKeyLabel="NI number" />,
    );
    const badge = screen.getByTestId('attribute-flag-ak');
    expect(badge.getAttribute('title')).toBe('AK1 — NI number');
  });

  it('AK badge tooltip falls back to "Alt key group AK1" when no label set', () => {
    render(<AttributeFlagCell isPk={false} isFk={false} altKeyGroup="AK1" altKeyLabel={null} />);
    const badge = screen.getByTestId('attribute-flag-ak');
    expect(badge.getAttribute('title')).toBe('Alt key group AK1');
  });

  it('NN + UQ are NOT rendered on the card (constraint details belong in the panel)', () => {
    render(<AttributeFlagCell isPk={false} isFk={false} isNn isUq altKeyGroup={null} />);
    // Erwin / ER Studio diagrams show roles (PK / FK / BK) only; NN + UQ
    // are constraint details surfaced in the attribute properties panel.
    // The component accepts the props for API compatibility but renders
    // nothing for them.
    expect(screen.queryByText('NN')).toBeNull();
    expect(screen.queryByText('UQ')).toBeNull();
    expect(screen.queryByText('PK')).toBeNull();
    expect(screen.queryByText('FK')).toBeNull();
  });
});
