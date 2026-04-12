import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '../lib/api';
import type { OrchestrationRelayPayload } from '../components/flow/OutputPickerModal';

const STORAGE_KEY = 'spresso_content_builder_draft';

interface CommandHistoryEntry {
  instruction: string;
  timestamp: string;
}

interface ContentBuilderState {
  title: string;
  mainBody: string;
  platformBodies: Record<string, string>;
  imageUrl: string | null;
  videoUrl: string | null;
  selectedChannels: string[];
  selectedAccounts: Record<string, string[]>; // channelId → socialAccountId[]
  activePromptId: string | null;
  activePromptName: string | null;
  activePromptBody: string | null;
  activeTab: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isAdapting: boolean;
  isProcessing: boolean;
  commandHistory: CommandHistoryEntry[];
  previousContent: string | null;
}

const initialState: ContentBuilderState = {
  title: '',
  mainBody: '',
  platformBodies: {},
  imageUrl: null,
  videoUrl: null,
  selectedChannels: [],
  selectedAccounts: {},
  activePromptId: null,
  activePromptName: null,
  activePromptBody: null,
  activeTab: null,
  isDirty: false,
  isSaving: false,
  isAdapting: false,
  isProcessing: false,
  commandHistory: [],
  previousContent: null,
};

export function useContentBuilder() {
  const [state, setState] = useState<ContentBuilderState>(initialState);

  // Auto-save to localStorage on content changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state.mainBody || state.title || Object.keys(state.platformBodies).length > 0) {
        const toSave = {
          title: state.title,
          mainBody: state.mainBody,
          platformBodies: state.platformBodies,
          imageUrl: state.imageUrl,
          selectedChannels: state.selectedChannels,
          selectedAccounts: state.selectedAccounts,
          activePromptId: state.activePromptId,
          activePromptName: state.activePromptName,
          activePromptBody: state.activePromptBody,
          activeTab: state.activeTab,
          commandHistory: state.commandHistory,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      }
    }, 1000); // save 1s after last change
    return () => clearTimeout(timer);
  }, [
    state.title,
    state.mainBody,
    state.platformBodies,
    state.imageUrl,
    state.selectedChannels,
    state.selectedAccounts,
    state.activeTab,
    state.activePromptId,
    state.activePromptName,
    state.activePromptBody,
    state.commandHistory,
  ]);

  const markDirty = useCallback(() => {
    setState((prev) => (prev.isDirty ? prev : { ...prev, isDirty: true }));
  }, []);

  const setTitle = useCallback(
    (title: string) => {
      setState((prev) => ({ ...prev, title }));
      markDirty();
    },
    [markDirty],
  );

  const setMainBody = useCallback(
    (mainBody: string) => {
      setState((prev) => ({ ...prev, mainBody }));
      markDirty();
    },
    [markDirty],
  );

  const setPlatformBody = useCallback(
    (channelId: string, body: string) => {
      setState((prev) => ({
        ...prev,
        platformBodies: { ...prev.platformBodies, [channelId]: body },
      }));
      markDirty();
    },
    [markDirty],
  );

  const setImageUrl = useCallback(
    (url: string | null) => {
      setState((prev) => ({ ...prev, imageUrl: url }));
      markDirty();
    },
    [markDirty],
  );

  const setVideoUrl = useCallback(
    (url: string | null) => {
      setState((prev) => ({ ...prev, videoUrl: url }));
      markDirty();
    },
    [markDirty],
  );

  const toggleChannel = useCallback(
    (channelId: string) => {
      setState((prev) => {
        const isSelected = prev.selectedChannels.includes(channelId);
        const selectedChannels = isSelected
          ? prev.selectedChannels.filter((id) => id !== channelId)
          : [...prev.selectedChannels, channelId];

        // Clear account selections when deselecting a channel
        const selectedAccounts = { ...prev.selectedAccounts };
        if (isSelected) {
          delete selectedAccounts[channelId];
        }

        // If we removed the active tab, fall back to the first selected channel
        let activeTab = prev.activeTab;
        if (isSelected && prev.activeTab === channelId) {
          activeTab = selectedChannels.length > 0 ? selectedChannels[0] : null;
        }
        // If we added the first channel, make it active
        if (!isSelected && selectedChannels.length === 1) {
          activeTab = channelId;
        }

        return { ...prev, selectedChannels, selectedAccounts, activeTab };
      });
      markDirty();
    },
    [markDirty],
  );

  const toggleAccount = useCallback(
    (channelId: string, accountId: string) => {
      setState((prev) => {
        const current = prev.selectedAccounts[channelId] ?? [];
        const isSelected = current.includes(accountId);
        const updated = isSelected
          ? current.filter((id) => id !== accountId)
          : [...current, accountId];
        return {
          ...prev,
          selectedAccounts: { ...prev.selectedAccounts, [channelId]: updated },
        };
      });
      markDirty();
    },
    [markDirty],
  );

  const setAccountsForChannel = useCallback(
    (channelId: string, accountIds: string[]) => {
      setState((prev) => ({
        ...prev,
        selectedAccounts: { ...prev.selectedAccounts, [channelId]: accountIds },
      }));
      markDirty();
    },
    [markDirty],
  );

  const setActiveTab = useCallback((channelId: string | null) => {
    setState((prev) => ({ ...prev, activeTab: channelId }));
  }, []);

  const loadPrompt = useCallback((promptId: string, name?: string, body?: string) => {
    setState((prev) => ({
      ...prev,
      activePromptId: promptId,
      activePromptName: name ?? null,
      activePromptBody: body ?? null,
    }));
  }, []);

  const clearPrompt = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activePromptId: null,
      activePromptName: null,
      activePromptBody: null,
    }));
  }, []);

  const insertFromChat = useCallback(
    (text: string) => {
      setState((prev) => {
        // If a platform tab is active, insert into that platform's body
        if (prev.activeTab) {
          const existing = prev.platformBodies[prev.activeTab] ?? '';
          return {
            ...prev,
            platformBodies: {
              ...prev.platformBodies,
              [prev.activeTab]: existing ? existing + '\n' + text : text,
            },
          };
        }
        // Otherwise append to main body
        return {
          ...prev,
          mainBody: prev.mainBody ? prev.mainBody + '\n' + text : text,
        };
      });
      markDirty();
    },
    [markDirty],
  );

  const saveAsDraft = useCallback(async () => {
    setState((prev) => ({ ...prev, isSaving: true }));
    try {
      const current = state;
      const items = current.selectedChannels.map((channelId) => ({
        title: current.title,
        body: current.platformBodies[channelId] || current.mainBody,
        channelId,
        status: 'draft' as const,
        imageUrl: current.imageUrl,
      }));

      // If no channels selected, save a single generic draft
      if (items.length === 0) {
        items.push({
          title: current.title,
          body: current.mainBody,
          channelId: null as unknown as string,
          status: 'draft' as const,
          imageUrl: current.imageUrl,
        });
      }

      await api.post('/content/batch', { items });
      setState((prev) => ({ ...prev, isDirty: false, isSaving: false }));
    } catch {
      setState((prev) => ({ ...prev, isSaving: false }));
    }
  }, [state]);

  const adaptAll = useCallback(async () => {
    setState((prev) => ({ ...prev, isAdapting: true }));
    try {
      const current = state;
      const res = await api.post<{ success: boolean; data: Record<string, string> }>(
        '/content/generate-multi',
        {
          mainBody: current.mainBody,
          channelIds: current.selectedChannels,
          model: 'anthropic/claude-sonnet-4-6',
        },
      );

      const bodies = res.data.data;
      setState((prev) => ({
        ...prev,
        platformBodies: { ...prev.platformBodies, ...bodies },
        activeTab: prev.selectedChannels.length > 0 ? prev.selectedChannels[0] : prev.activeTab,
        isAdapting: false,
      }));
    } catch (err) {
      console.error('Failed to adapt content for platforms:', err);
      setState((prev) => ({ ...prev, isAdapting: false }));
    }
  }, [state]);

  const addCommand = useCallback((instruction: string) => {
    setState((prev) => ({
      ...prev,
      commandHistory: [
        ...prev.commandHistory,
        { instruction, timestamp: new Date().toISOString() },
      ],
    }));
  }, []);

  const undoLastAI = useCallback(() => {
    setState((prev) => {
      if (prev.previousContent === null) return prev;
      // Restore to the active editor target
      if (prev.activeTab) {
        return {
          ...prev,
          platformBodies: {
            ...prev.platformBodies,
            [prev.activeTab]: prev.previousContent,
          },
          previousContent: null,
        };
      }
      return {
        ...prev,
        mainBody: prev.previousContent,
        previousContent: null,
      };
    });
  }, []);

  const loadFromOrchestration = useCallback((payload: OrchestrationRelayPayload) => {
    setState({
      ...initialState,
      title: payload.title || '',
      mainBody: payload.mainBody || '',
      imageUrl: payload.imageUrl || null,
      platformBodies: payload.platformBodies || {},
      selectedChannels: payload.channels || [],
      selectedAccounts: {},
      activeTab: payload.channels?.[0] ?? null,
      isDirty: true,
      activePromptId: null,
      activePromptName: null,
      activePromptBody: null,
      isProcessing: false,
      isSaving: false,
      isAdapting: false,
      commandHistory: [],
      previousContent: null,
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /** Clear content after publish/schedule, preserving channels, accounts, active tab, and prompt */
  const resetContent = useCallback(() => {
    setState((prev) => ({
      ...initialState,
      selectedChannels: prev.selectedChannels,
      selectedAccounts: prev.selectedAccounts,
      activeTab: null, // Back to Main tab after publish
      activePromptId: prev.activePromptId,
      activePromptName: prev.activePromptName,
      activePromptBody: prev.activePromptBody,
    }));
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const flowState = useMemo((): FlowState => {
    const hasChannels = state.selectedChannels.length > 0;
    const hasAdapted = hasChannels && Object.keys(state.platformBodies).length > 0;
    const hasMedia = !!state.imageUrl;

    if (hasAdapted && hasMedia) return 'READY';
    if (hasMedia && hasChannels) return 'MEDIA_ADDED';
    if (hasAdapted) return 'ADAPTED';
    if (hasChannels) return 'PLATFORMS_SELECTED';
    if (state.mainBody.trim().length > 0) return 'WRITING';
    return 'IDLE';
  }, [state.selectedChannels, state.platformBodies, state.mainBody, state.imageUrl]);

  return {
    // State
    ...state,

    // Setters
    setTitle,
    setMainBody,
    setPlatformBody,
    setImageUrl,
    setVideoUrl,

    // Actions
    toggleChannel,
    toggleAccount,
    setAccountsForChannel,
    setActiveTab,
    loadPrompt,
    clearPrompt,
    insertFromChat,
    saveAsDraft,
    adaptAll,
    addCommand,
    undoLastAI,
    loadFromOrchestration,
    reset,
    resetContent,
    flowState,

    // AI Command helpers
    setProcessing: (v: boolean) => setState((prev) => ({ ...prev, isProcessing: v })),
    storePreviousContent: () =>
      setState((prev) => {
        const current = prev.activeTab
          ? (prev.platformBodies[prev.activeTab] ?? '')
          : prev.mainBody;
        return { ...prev, previousContent: current };
      }),
  };
}

export type FlowState =
  | 'IDLE'
  | 'WRITING'
  | 'PLATFORMS_SELECTED'
  | 'ADAPTED'
  | 'MEDIA_ADDED'
  | 'READY';
