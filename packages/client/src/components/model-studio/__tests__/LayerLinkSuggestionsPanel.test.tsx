// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LayerLinkSuggestion } from '@cc/shared';
import { LayerLinkSuggestionsPanel } from '../LayerLinkSuggestionsPanel';

afterEach(() => cleanup());

const FROM_ID_A = '11111111-1111-1111-1111-111111111111';
const TO_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FROM_ID_B = '22222222-2222-2222-2222-222222222222';
const TO_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function pair(fromId: string, fromName: string, toId: string, toName: string): LayerLinkSuggestion {
  return {
    fromEntityId: fromId,
    fromEntityName: fromName,
    toEntityId: toId,
    toEntityName: toName,
    confidence: 'high',
  };
}

const TWO_SUGGESTIONS: LayerLinkSuggestion[] = [
  pair(FROM_ID_A, 'product', TO_ID_A, 'product'),
  pair(FROM_ID_B, 'customer', TO_ID_B, 'customer'),
];

interface RenderOpts {
  isOpen?: boolean;
  suggestions?: LayerLinkSuggestion[];
  isLoading?: boolean;
  onAccept?: (parentId: string, childId: string) => Promise<unknown>;
  onAccepted?: () => void;
  onClose?: () => void;
  loadSuggestions?: (...args: unknown[]) => Promise<unknown>;
  clearSuggestions?: () => void;
}

function renderPanel(opts: RenderOpts = {}) {
  const props = {
    isOpen: opts.isOpen ?? true,
    onClose: opts.onClose ?? vi.fn(),
    defaultFrom: 'logical' as const,
    defaultTo: 'physical' as const,
    suggestions: opts.suggestions ?? [],
    isLoading: opts.isLoading ?? false,
    loadSuggestions: opts.loadSuggestions ?? vi.fn().mockResolvedValue(undefined),
    clearSuggestions: opts.clearSuggestions ?? vi.fn(),
    onAccept: opts.onAccept ?? vi.fn().mockResolvedValue({}),
    onAccepted: opts.onAccepted ?? vi.fn(),
  };
  return { ...render(<LayerLinkSuggestionsPanel {...props} />), props };
}

describe('LayerLinkSuggestionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen=false', () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByTestId('layer-link-suggestions-panel')).toBeNull();
  });

  it('shows the loading state while a fetch is in flight', () => {
    renderPanel({ isLoading: true });
    expect(screen.getByTestId('suggestions-loading')).toBeTruthy();
  });

  it('shows the empty state when no suggestions came back', () => {
    renderPanel({ suggestions: [], isLoading: false });
    expect(screen.getByTestId('suggestions-empty')).toBeTruthy();
  });

  it('renders one row per suggestion with names + confidence chip', () => {
    renderPanel({ suggestions: TWO_SUGGESTIONS });
    expect(screen.getByTestId(`suggestion-row-${FROM_ID_A}::${TO_ID_A}`).textContent).toContain(
      'product',
    );
    expect(screen.getByTestId(`suggestion-row-${FROM_ID_B}::${TO_ID_B}`).textContent).toContain(
      'customer',
    );
    expect(screen.getAllByTestId('suggestion-confidence-chip')).toHaveLength(2);
  });

  it('triggers loadSuggestions on open with the supplied default from/to', async () => {
    const loadSuggestions = vi.fn().mockResolvedValue(undefined);
    renderPanel({ loadSuggestions });
    await waitFor(() => expect(loadSuggestions).toHaveBeenCalled());
    expect(loadSuggestions).toHaveBeenCalledWith('logical', 'physical');
  });

  it('refetches when the user changes the from-layer picker', async () => {
    const loadSuggestions = vi.fn().mockResolvedValue(undefined);
    renderPanel({ loadSuggestions });
    await waitFor(() => expect(loadSuggestions).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('suggestions-from'), { target: { value: 'conceptual' } });
    await waitFor(() => expect(loadSuggestions).toHaveBeenCalledTimes(2));
    const lastCall = loadSuggestions.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('conceptual');
  });

  it('clicking accept on a row calls onAccept(fromId, toId) and flips the row to "Linked"', async () => {
    const onAccept = vi.fn().mockResolvedValue({});
    const onAccepted = vi.fn();
    renderPanel({ suggestions: TWO_SUGGESTIONS, onAccept, onAccepted });
    fireEvent.click(screen.getByTestId(`suggestion-row-accept-${FROM_ID_A}::${TO_ID_A}`));
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith(FROM_ID_A, TO_ID_A));
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(`suggestion-row-done-${FROM_ID_A}::${TO_ID_A}`)).toBeTruthy();
  });

  it('failed accepts surface the error and the row stays in the list', async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error('Already linked'));
    renderPanel({ suggestions: TWO_SUGGESTIONS, onAccept });
    fireEvent.click(screen.getByTestId(`suggestion-row-accept-${FROM_ID_A}::${TO_ID_A}`));
    await waitFor(() =>
      expect(screen.getByTestId(`suggestion-row-error-${FROM_ID_A}::${TO_ID_A}`)).toBeTruthy(),
    );
    expect(
      screen.getByTestId(`suggestion-row-${FROM_ID_A}::${TO_ID_A}`).getAttribute('data-state'),
    ).toBe('failed');
  });

  it('clicking reject hides the row from the visible list', () => {
    renderPanel({ suggestions: TWO_SUGGESTIONS });
    fireEvent.click(screen.getByTestId(`suggestion-row-reject-${FROM_ID_A}::${TO_ID_A}`));
    expect(screen.queryByTestId(`suggestion-row-${FROM_ID_A}::${TO_ID_A}`)).toBeNull();
    expect(screen.getByTestId(`suggestion-row-${FROM_ID_B}::${TO_ID_B}`)).toBeTruthy();
  });

  it('"Accept all" iterates every acceptable row in order', async () => {
    const onAccept = vi.fn().mockResolvedValue({});
    const onAccepted = vi.fn();
    renderPanel({ suggestions: TWO_SUGGESTIONS, onAccept, onAccepted });
    fireEvent.click(screen.getByTestId('suggestions-accept-all'));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(2));
    expect(onAccept).toHaveBeenNthCalledWith(1, FROM_ID_A, TO_ID_A);
    expect(onAccept).toHaveBeenNthCalledWith(2, FROM_ID_B, TO_ID_B);
    expect(onAccepted).toHaveBeenCalledTimes(2);
  });

  it('close button fires onClose AND clearSuggestions to drop the stale list', () => {
    const onClose = vi.fn();
    const clearSuggestions = vi.fn();
    renderPanel({ suggestions: TWO_SUGGESTIONS, onClose, clearSuggestions });
    fireEvent.click(screen.getByTestId('suggestions-close'));
    expect(clearSuggestions).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
