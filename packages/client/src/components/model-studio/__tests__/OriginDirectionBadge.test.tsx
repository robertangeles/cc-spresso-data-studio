// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OriginDirectionBadge } from '../OriginDirectionBadge';

afterEach(() => cleanup());

describe('OriginDirectionBadge', () => {
  it('renders the greenfield label', () => {
    render(<OriginDirectionBadge value="greenfield" />);
    expect(screen.getByTestId('origin-direction-badge').textContent).toBe('Greenfield');
  });

  it('renders the existing_system label', () => {
    render(<OriginDirectionBadge value="existing_system" />);
    expect(screen.getByTestId('origin-direction-badge').textContent).toBe('Existing System');
  });

  it('has an accessible aria-label', () => {
    render(<OriginDirectionBadge value="greenfield" />);
    const badge = screen.getByTestId('origin-direction-badge');
    expect(badge.getAttribute('aria-label')).toBe('Origin direction: Greenfield');
  });
});
