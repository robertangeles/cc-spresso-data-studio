import { describe, it, expect } from 'vitest';

// Test the flowState logic directly (not the hook — that needs renderHook)
// This tests the core business logic extracted from useContentBuilder's useMemo

type FlowState = 'IDLE' | 'WRITING' | 'PLATFORMS_SELECTED' | 'ADAPTED' | 'MEDIA_ADDED' | 'READY';

describe('Content Builder Flow State', () => {
  /**
   * Mirror of the flowState computation in useContentBuilder.ts (lines 189-200).
   * Kept in sync manually — if the hook logic changes, update this too.
   */
  function computeFlowState(params: {
    selectedChannels: string[];
    platformBodies: Record<string, string>;
    mainBody: string;
    imageUrl: string | null;
  }): FlowState {
    const { selectedChannels, platformBodies, mainBody, imageUrl } = params;
    const hasChannels = selectedChannels.length > 0;
    const hasAdapted = hasChannels && Object.keys(platformBodies).length > 0;
    const hasMedia = !!imageUrl;

    if (hasAdapted && hasMedia) return 'READY';
    if (hasMedia && hasChannels) return 'MEDIA_ADDED';
    if (hasAdapted) return 'ADAPTED';
    if (hasChannels) return 'PLATFORMS_SELECTED';
    if (mainBody.trim().length > 0) return 'WRITING';
    return 'IDLE';
  }

  it('returns IDLE when nothing is set', () => {
    expect(
      computeFlowState({ selectedChannels: [], platformBodies: {}, mainBody: '', imageUrl: null }),
    ).toBe('IDLE');
  });

  it('returns IDLE for whitespace-only body', () => {
    expect(
      computeFlowState({
        selectedChannels: [],
        platformBodies: {},
        mainBody: '   ',
        imageUrl: null,
      }),
    ).toBe('IDLE');
  });

  it('returns WRITING when body has content but no channels', () => {
    expect(
      computeFlowState({
        selectedChannels: [],
        platformBodies: {},
        mainBody: 'Hello world',
        imageUrl: null,
      }),
    ).toBe('WRITING');
  });

  it('returns PLATFORMS_SELECTED when channels are chosen', () => {
    expect(
      computeFlowState({
        selectedChannels: ['ch1'],
        platformBodies: {},
        mainBody: 'Hello',
        imageUrl: null,
      }),
    ).toBe('PLATFORMS_SELECTED');
  });

  it('returns ADAPTED when platform bodies exist', () => {
    expect(
      computeFlowState({
        selectedChannels: ['ch1'],
        platformBodies: { ch1: 'adapted text' },
        mainBody: 'Hello',
        imageUrl: null,
      }),
    ).toBe('ADAPTED');
  });

  it('returns MEDIA_ADDED when image exists with channels but no adapted bodies', () => {
    expect(
      computeFlowState({
        selectedChannels: ['ch1'],
        platformBodies: {},
        mainBody: 'Hello',
        imageUrl: 'https://example.com/img.png',
      }),
    ).toBe('MEDIA_ADDED');
  });

  it('returns READY when adapted and image are both present', () => {
    expect(
      computeFlowState({
        selectedChannels: ['ch1'],
        platformBodies: { ch1: 'adapted' },
        mainBody: 'Hello',
        imageUrl: 'https://example.com/img.png',
      }),
    ).toBe('READY');
  });

  it('skips to PLATFORMS_SELECTED even without body when channels selected', () => {
    expect(
      computeFlowState({
        selectedChannels: ['ch1'],
        platformBodies: {},
        mainBody: '',
        imageUrl: null,
      }),
    ).toBe('PLATFORMS_SELECTED');
  });

  it('ignores platformBodies when no channels are selected', () => {
    // platformBodies without selectedChannels should still be WRITING (hasAdapted requires hasChannels)
    expect(
      computeFlowState({
        selectedChannels: [],
        platformBodies: { ch1: 'text' },
        mainBody: 'Hello',
        imageUrl: null,
      }),
    ).toBe('WRITING');
  });
});
