// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutoProjectButton } from '../AutoProjectButton';

afterEach(() => cleanup());

describe('AutoProjectButton', () => {
  it('renders nothing when the entity is already linked toward its expected next layer', () => {
    const { container } = render(
      <AutoProjectButton
        entityId="e1"
        ownLayer="logical"
        origin="greenfield"
        cell={{ conceptual: false, logical: true, physical: true }}
        onProject={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on the terminal layer (greenfield + physical)', () => {
    const { container } = render(
      <AutoProjectButton
        entityId="e1"
        ownLayer="physical"
        origin="greenfield"
        cell={{ conceptual: false, logical: false, physical: true }}
        onProject={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders with the next-layer letter when the entity is unlinked toward it', () => {
    render(
      <AutoProjectButton
        entityId="e1"
        ownLayer="conceptual"
        origin="greenfield"
        cell={{ conceptual: true, logical: false, physical: false }}
        onProject={vi.fn()}
      />,
    );
    const btn = screen.getByTestId('auto-project-button');
    expect(btn.getAttribute('data-target-layer')).toBe('logical');
    expect(btn.textContent).toContain('L');
  });

  it('renders nothing for existing_system models (server only supports greenfield auto-project)', () => {
    const { container } = render(
      <AutoProjectButton
        entityId="e1"
        ownLayer="physical"
        origin="existing_system"
        cell={{ conceptual: false, logical: false, physical: true }}
        onProject={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onProject(entityId, targetLayer) on click and stops propagation', async () => {
    const onProject = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoProjectButton
        entityId="e-42"
        ownLayer="logical"
        origin="greenfield"
        cell={{ conceptual: false, logical: true, physical: false }}
        onProject={onProject}
      />,
    );
    fireEvent.click(screen.getByTestId('auto-project-button'));
    await waitFor(() => expect(onProject).toHaveBeenCalledTimes(1));
    expect(onProject).toHaveBeenCalledWith('e-42', 'physical');
  });

  it('disables the button while the project mutation is in flight', async () => {
    let resolveFn!: () => void;
    const onProject = vi.fn(() => new Promise<void>((r) => (resolveFn = r)));
    render(
      <AutoProjectButton
        entityId="e1"
        ownLayer="conceptual"
        origin="greenfield"
        cell={{ conceptual: true, logical: false, physical: false }}
        onProject={onProject}
      />,
    );
    const btn = screen.getByTestId('auto-project-button') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    resolveFn();
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});
