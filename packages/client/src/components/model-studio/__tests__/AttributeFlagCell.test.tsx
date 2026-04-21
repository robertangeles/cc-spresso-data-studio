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

  it('NN + UQ renders both constraint codes', () => {
    render(<AttributeFlagCell isPk={false} isFk={false} isNn isUq altKeyGroup={null} />);
    expect(screen.getByText('NN')).toBeTruthy();
    expect(screen.getByText('UQ')).toBeTruthy();
    expect(screen.queryByText('PK')).toBeNull();
  });
});
