// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, fireEvent, screen } from '@testing-library/react';
import { LayerSwitcher } from '../LayerSwitcher';

/** Step 7 — LayerSwitcher tests. Covers click-to-change, disabled
 *  state, D-2 unlinked glow, and the global Shift+Alt+{C,L,P}
 *  keyboard shortcut. */

afterEach(() => cleanup());

describe('LayerSwitcher', () => {
  it('renders three pills with the correct active state', () => {
    render(<LayerSwitcher value="logical" onChange={() => {}} />);
    expect(screen.getByTestId('layer-pill-conceptual').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('layer-pill-logical').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('layer-pill-physical').getAttribute('aria-checked')).toBe('false');
  });

  it('fires onChange when a non-active pill is clicked', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="conceptual" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('layer-pill-logical'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('logical');
  });

  it('does NOT fire onChange when the active pill is clicked', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="logical" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('layer-pill-logical'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does NOT fire onChange when disabled', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="conceptual" onChange={onChange} disabled />);
    fireEvent.click(screen.getByTestId('layer-pill-logical'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds the D-2 unlinked-entity glow class when hasUnlinkedEntities=true', () => {
    const { rerender } = render(
      <LayerSwitcher value="conceptual" onChange={() => {}} hasUnlinkedEntities={false} />,
    );
    const group = screen.getByTestId('layer-switcher');
    expect(group.className).not.toContain('border-accent/30');

    rerender(<LayerSwitcher value="conceptual" onChange={() => {}} hasUnlinkedEntities={true} />);
    expect(group.className).toContain('border-accent/30');
    expect(group.className).toContain('shadow-[0_0_12px_rgba(255,214,10,0.18)]');
  });

  it('Shift+Alt+L globally fires onChange to "logical"', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="conceptual" onChange={onChange} />);
    fireEvent.keyDown(document, { key: 'l', shiftKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith('logical');
  });

  it('Shift+Alt+P globally fires onChange to "physical"', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="logical" onChange={onChange} />);
    fireEvent.keyDown(document, { key: 'p', shiftKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith('physical');
  });

  it('ignores the shortcut when the focused element is an input (avoids swallowing text)', () => {
    const onChange = vi.fn();
    render(
      <div>
        <LayerSwitcher value="conceptual" onChange={onChange} />
        <input data-testid="text" />
      </div>,
    );
    const input = screen.getByTestId('text') as HTMLInputElement;
    input.focus();
    // Fire on the input itself — the event bubbles up to the document
    // listener installed by LayerSwitcher, and `document.activeElement`
    // is the input at that moment, so the `isTextInputFocused()` guard
    // should short-circuit without calling onChange.
    fireEvent.keyDown(input, { key: 'l', shiftKey: true, altKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores the shortcut when Ctrl or Meta is also held (avoids accidental combos)', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="conceptual" onChange={onChange} />);
    fireEvent.keyDown(document, { key: 'l', shiftKey: true, altKey: true, ctrlKey: true });
    fireEvent.keyDown(document, { key: 'l', shiftKey: true, altKey: true, metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ArrowRight from the current pill moves focus forward cyclically', () => {
    const onChange = vi.fn();
    render(<LayerSwitcher value="conceptual" onChange={onChange} />);
    const conceptualPill = screen.getByTestId('layer-pill-conceptual');
    fireEvent.keyDown(conceptualPill, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('logical');
  });
});
