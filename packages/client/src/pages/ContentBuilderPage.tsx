import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PenTool,
  Sparkles,
  Save,
  Keyboard,
  Check,
  PanelLeftClose,
  PanelRightClose,
  Info,
  RotateCcw,
} from 'lucide-react';
import {
  ORCHESTRATION_RELAY_KEY,
  type OrchestrationRelayPayload,
} from '../components/flow/OutputPickerModal';
import { PlatformSelector } from '../components/content-builder/PlatformSelector';
import { PostComposer } from '../components/content-builder/PostComposer';
import { CopilotChat } from '../components/content-builder/CopilotChat';
import { CharacterCountBar } from '../components/content-builder/CharacterCountBar';
import { SchedulePanel } from '../components/content-builder/SchedulePanel';
import { BuilderEmptyState } from '../components/content-builder/BuilderEmptyState';
import MediaStudio from '../components/content-builder/MediaStudio';
import { PromptEditorModal } from '../components/content-builder/PromptEditorModal';
import { StepIndicator } from '../components/content-builder/StepIndicator';
import { useContentBuilder } from '../hooks/useContentBuilder';
import { usePrompts } from '../hooks/usePrompts';
import { useContentChat } from '../hooks/useContentChat';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { isContentResponse, synthesizeTriggerMessage } from '../utils/contentDetection';

interface Channel {
  id: string;
  name: string;
  slug: string;
  icon: string;
  config: Record<string, unknown>;
}

export function ContentBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pinterestBoardId, setPinterestBoardId] = useState('');
  const [pinterestBoardName, setPinterestBoardName] = useState('');
  const [pinterestLink, setPinterestLink] = useState('');
  const [youtubeTags, setYoutubeTags] = useState('');
  const [youtubePrivacy, setYoutubePrivacy] = useState('public');
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const pendingRelayRef = useRef<OrchestrationRelayPayload | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<{
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  } | null>(null);

  const [isCopilotActive, setIsCopilotActive] = useState(false);

  const builder = useContentBuilder();

  // When copilot is active but no content in editor yet, treat as WRITING
  const effectiveFlowState =
    isCopilotActive && builder.flowState === 'IDLE' ? 'WRITING' : builder.flowState;
  const promptsHook = usePrompts();
  const chat = useContentChat(builder.activePromptBody);
  const { user } = useAuth();
  const { toast } = useToast();

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<
    {
      id: string;
      platform: string;
      accountType: string;
      label: string | null;
      accountName: string | null;
      accountId: string | null;
      isConnected: boolean;
    }[]
  >([]);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // Fetch available channels and connected platforms on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchChannels() {
      try {
        const { data } = await api.get('/content/channels');
        if (!cancelled) {
          setChannels(data.data ?? data);
        }
      } catch {
        // Channels will remain empty
      }
    }
    async function fetchConnected() {
      try {
        const { data } = await api.get('/oauth/connected');
        if (!cancelled) {
          setConnectedPlatforms(data.data ?? []);
        }
      } catch {
        // Connected platforms will remain empty
      }
    }
    async function fetchAccounts() {
      try {
        const { data } = await api.get('/oauth/accounts');
        if (!cancelled) {
          setSocialAccounts(data.data ?? []);
        }
      } catch {
        // Social accounts will remain empty
      }
    }
    fetchChannels();
    fetchConnected();
    fetchAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build a map of channelId → social accounts for multi-account picker
  const accountsByChannel = useMemo(() => {
    const map: Record<string, typeof socialAccounts> = {};
    for (const ch of channels) {
      const matching = socialAccounts.filter((a) => a.platform === ch.slug);
      if (matching.length > 0) map[ch.id] = matching;
    }
    return map;
  }, [channels, socialAccounts]);

  // Auto-select single accounts when a channel is toggled on
  useEffect(() => {
    for (const channelId of builder.selectedChannels) {
      const accounts = accountsByChannel[channelId];
      if (!accounts) continue;
      const currentSelection = builder.selectedAccounts[channelId];
      // Auto-select if exactly 1 account and nothing selected yet
      if (accounts.length === 1 && (!currentSelection || currentSelection.length === 0)) {
        builder.setAccountsForChannel(channelId, [accounts[0].id]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder.selectedChannels, accountsByChannel]);

  // Keyboard shortcuts
  const handleKeyboard = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ctrl+S / Cmd+S -> save draft
      if (e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (builder.isDirty && !builder.isSaving) builder.saveAsDraft();
        return;
      }
      // Ctrl+Shift+A / Cmd+Shift+A -> adapt all
      if (e.key === 'A' && e.shiftKey) {
        e.preventDefault();
        if (!builder.isAdapting && builder.selectedChannels.length >= 2) builder.adaptAll();
        return;
      }
      // Ctrl+Shift+S / Cmd+Shift+S -> focus schedule input
      if (e.key === 'S' && e.shiftKey) {
        e.preventDefault();
        const scheduleInput = document.querySelector<HTMLInputElement>(
          'input[type="datetime-local"], input[type="date"]',
        );
        if (scheduleInput) scheduleInput.focus();
        return;
      }
      // Ctrl+Z -> undo last AI command (only if previousContent exists)
      if (e.key === 'z' && !e.shiftKey && builder.previousContent !== null) {
        e.preventDefault();
        builder.undoLastAI();
        toast('AI change undone', 'info');
        return;
      }
    },
    [builder, toast],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  // ── Orchestration relay detection ────────────────────────────────────
  // Wait for channels to load so we can resolve slugs → IDs
  const relayProcessedRef = useRef(false);

  useEffect(() => {
    if (relayProcessedRef.current) return;
    if (searchParams.get('from') !== 'orchestration') return;
    if (channels.length === 0) return; // wait for channels to load

    relayProcessedRef.current = true;

    // Clear URL param immediately (replace history so back button doesn't re-trigger)
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    setSearchParams(next, { replace: true });

    let payload: OrchestrationRelayPayload;
    try {
      const raw = localStorage.getItem(ORCHESTRATION_RELAY_KEY);
      if (!raw) {
        toast('Nothing to load from workflow', 'info');
        return;
      }
      payload = JSON.parse(raw);
    } catch {
      localStorage.removeItem(ORCHESTRATION_RELAY_KEY);
      toast('Could not load workflow content', 'error');
      return;
    }

    localStorage.removeItem(ORCHESTRATION_RELAY_KEY);

    // Resolve channel slugs to channel IDs (skip if already IDs, e.g. from remix relay)
    if (payload.channels && payload.channels.length > 0) {
      const firstIsId = channels.some((ch) => ch.id === payload.channels[0]);
      if (!firstIsId) {
        const resolvedIds = payload.channels
          .map((slug) => channels.find((ch) => ch.slug === slug)?.id)
          .filter((id): id is string => !!id);
        payload = { ...payload, channels: resolvedIds };
      }
    }

    // Also resolve platformBodies keys from slugs to channel IDs
    if (payload.platformBodies && Object.keys(payload.platformBodies).length > 0) {
      const keys = Object.keys(payload.platformBodies);
      const firstIsId = channels.some((ch) => ch.id === keys[0]);
      if (!firstIsId) {
        const resolvedBodies: Record<string, string> = {};
        for (const [slug, body] of Object.entries(payload.platformBodies)) {
          const ch = channels.find((c) => c.slug === slug);
          if (ch) resolvedBodies[ch.id] = body;
        }
        payload = { ...payload, platformBodies: resolvedBodies };
      }
    }

    // If editor has unsaved content, ask for confirmation
    if (builder.isDirty || builder.mainBody.trim().length > 0) {
      pendingRelayRef.current = payload;
      setShowReplaceConfirm(true);
    } else {
      builder.loadFromOrchestration(payload);
      if (payload.remixContext) {
        toast(
          `Remix loaded \u2022 ${payload.remixContext.sourceItems.length} source${payload.remixContext.sourceItems.length !== 1 ? 's' : ''} \u2022 Adapt to generate platform versions`,
          'success',
        );
      } else {
        toast(
          `Loaded from "${payload.orchestrationName}" \u2022 ${payload.fieldCount} field${payload.fieldCount !== 1 ? 's' : ''} mapped`,
          'success',
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  const handleConfirmReplace = useCallback(() => {
    const payload = pendingRelayRef.current;
    if (payload) {
      builder.loadFromOrchestration(payload);
      if (payload.remixContext) {
        toast(
          `Remix loaded \u2022 ${payload.remixContext.sourceItems.length} source${payload.remixContext.sourceItems.length !== 1 ? 's' : ''} \u2022 Adapt to generate platform versions`,
          'success',
        );
      } else {
        toast(
          `Loaded from "${payload.orchestrationName}" \u2022 ${payload.fieldCount} field${payload.fieldCount !== 1 ? 's' : ''} mapped`,
          'success',
        );
      }
    }
    pendingRelayRef.current = null;
    setShowReplaceConfirm(false);
  }, [builder, toast]);

  const handleCancelReplace = useCallback(() => {
    pendingRelayRef.current = null;
    setShowReplaceConfirm(false);
  }, []);

  // Compute selected channel objects from IDs
  const selectedChannelObjects = channels.filter((ch) => builder.selectedChannels.includes(ch.id));

  // Handle prompt selection from PromptBadge — auto-send trigger to AI
  const handleSelectPrompt = useCallback(
    async (promptId: string, name: string, body: string) => {
      // Don't re-trigger if same prompt is already active
      if (promptId === builder.activePromptId) return;

      setIsCopilotActive(true);
      const hadContent = !!builder.mainBody.trim();
      builder.loadPrompt(promptId, name, body);
      chat.clearChat();

      // If prompt has no body, just load it passively
      if (!body?.trim()) {
        toast(`Prompt loaded: ${name}`, 'success');
        return;
      }

      // Auto-send synthesized trigger message
      const trigger = synthesizeTriggerMessage(name);
      const response = await chat.sendMessage(trigger);

      if (response && isContentResponse(response)) {
        builder.setMainBody(response);
        if (hadContent) {
          toast('Previous draft replaced by prompt generation', 'info');
        } else {
          toast(`Content generated with ${name}!`, 'success');
        }
      } else if (response) {
        toast(`${name} active — continue the conversation`, 'info');
      }
    },
    [builder, chat, toast],
  );

  // Apply AI chat response content to the active editor tab
  const handleApplyToEditor = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      if (builder.activeTab) {
        // Apply to the active platform tab
        builder.setPlatformBody(builder.activeTab, content);
        toast('Content applied to platform editor', 'success');
      } else {
        // Apply to main body
        builder.setMainBody(content);
        toast('Content applied to editor', 'success');
      }
    },
    [builder, toast],
  );

  const handleCreateNewPrompt = () => {
    setEditingPrompt(null);
    setPromptModalOpen(true);
  };

  const handleEditPrompt = (prompt: {
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  }) => {
    setEditingPrompt({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      body: prompt.body,
      category: prompt.category,
      defaultModel: prompt.defaultModel,
    });
    setPromptModalOpen(true);
  };

  const handleSavePrompt = async (data: {
    name: string;
    description: string;
    body: string;
    category: string;
    defaultModel: string;
  }) => {
    try {
      if (editingPrompt) {
        await promptsHook.updatePrompt(editingPrompt.id, data);
        toast('Prompt updated successfully', 'success');
      } else {
        await promptsHook.createPrompt(data);
        toast('Prompt created successfully', 'success');
      }
    } catch {
      toast('Failed to save prompt', 'error');
    }
    setPromptModalOpen(false);
    setEditingPrompt(null);
  };

  // Whether to show the empty state
  const showEmptyState =
    builder.selectedChannels.length === 0 && !builder.mainBody.trim() && !builder.title.trim();

  // Empty state handlers
  const handleStartScratch = () => {
    setIsCopilotActive(true);
  };

  const handleOpenPrompts = () => {
    const promptBtn = document.querySelector<HTMLButtonElement>(
      '[data-tour="ai-assistant"] button',
    );
    if (promptBtn) promptBtn.click();
  };

  const handleRepurpose = () => {
    // TODO: navigate to content library
  };

  const handleQuickStart = useCallback(
    async (category: string) => {
      if (isGeneratingTemplate) return;
      setIsCopilotActive(true);
      setIsGeneratingTemplate(true);
      try {
        const { data } = await api.post<{
          success: boolean;
          data: { title: string; body: string; source: 'ai' | 'fallback' };
        }>('/content/templates', { category });

        const result = data.data;
        builder.setTitle(result.title);
        builder.setMainBody(result.body);

        if (result.source === 'ai') {
          toast('AI template generated! Edit it and make it yours.', 'success');
        } else {
          toast('Template loaded (AI unavailable — using starter skeleton).', 'info');
        }
      } catch {
        toast('Failed to generate template. Please try again.', 'error');
      } finally {
        setIsGeneratingTemplate(false);
      }
    },
    [builder, toast, isGeneratingTemplate],
  );

  // Image click handler
  const handleImageClick = () => {
    if (builder.imageUrl) {
      builder.setImageUrl(null);
    }
  };

  // Schedule handlers
  const handleSchedule = async (date: string) => {
    if (builder.selectedChannels.length === 0) {
      toast('Select at least one platform first.', 'error');
      return;
    }
    // Ensure every selected channel has at least one account picked
    const channelsWithoutAccounts = builder.selectedChannels.filter(
      (chId) => !builder.selectedAccounts[chId] || builder.selectedAccounts[chId].length === 0,
    );
    if (channelsWithoutAccounts.length > 0) {
      toast('Select an account for each platform before scheduling.', 'error');
      return;
    }
    // Pinterest validation
    const pinterestCh = channels.find((ch) => ch.slug === 'pinterest');
    if (pinterestCh && builder.selectedChannels.includes(pinterestCh.id)) {
      if (!builder.imageUrl) {
        toast('Pinterest requires an image. Add one in Media Studio.', 'error');
        return;
      }
      if (!pinterestBoardId) {
        toast('Select a Pinterest board before scheduling.', 'error');
        return;
      }
    }
    const content = builder.activeTab
      ? (builder.platformBodies[builder.activeTab] ?? builder.mainBody)
      : builder.mainBody;
    if (!content.trim()) {
      toast('Write some content before scheduling.', 'error');
      return;
    }
    if (!date) {
      toast('Pick a date and time to schedule.', 'error');
      return;
    }
    try {
      const { data: batchData } = await api.post('/content/batch', {
        userId: user?.id,
        title: builder.title || content.slice(0, 60).trim() || 'Untitled Post',
        mainBody: builder.mainBody,
        platformBodies:
          Object.keys(builder.platformBodies).length > 0
            ? builder.platformBodies
            : Object.fromEntries(builder.selectedChannels.map((id) => [id, builder.mainBody])),
        imageUrl: builder.imageUrl,
        videoUrl: builder.videoUrl,
        status: 'draft',
      });
      const items = batchData.data ?? [];
      let totalScheduled = 0;
      // Resolve Pinterest channel ID for metadata injection
      const pinterestChannel = channels.find((ch) => ch.slug === 'pinterest');
      for (const item of items) {
        const accountIds = builder.selectedAccounts[item.channelId];
        for (const socialAccountId of accountIds) {
          // Build per-post metadata for platform-specific fields
          const postMetadata: Record<string, unknown> = {};
          if (pinterestChannel && item.channelId === pinterestChannel.id && pinterestBoardId) {
            postMetadata.boardId = pinterestBoardId;
            postMetadata.boardName = pinterestBoardName;
            if (pinterestLink) postMetadata.link = pinterestLink;
          }
          await api.post('/schedule', {
            contentItemId: item.id,
            channelId: item.channelId,
            socialAccountId,
            scheduledAt: date,
            metadata: Object.keys(postMetadata).length > 0 ? postMetadata : undefined,
          });
          totalScheduled++;
        }
      }
      toast(
        `Scheduled ${totalScheduled} post(s) for ${new Date(date).toLocaleString()}`,
        'success',
      );
      builder.resetContent();
      chat.clearChat();
      setScheduleDate('');
      setCalendarRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Schedule failed:', err);
      toast('Failed to schedule. Please try again.', 'error');
    }
  };

  const handlePublishNow = async () => {
    if (builder.selectedChannels.length === 0) {
      toast('Select at least one platform first.', 'error');
      return;
    }
    // Pinterest validation
    const pinterestCh = channels.find((ch) => ch.slug === 'pinterest');
    if (pinterestCh && builder.selectedChannels.includes(pinterestCh.id)) {
      if (!builder.imageUrl) {
        toast('Pinterest requires an image. Add one in Media Studio.', 'error');
        return;
      }
      if (!pinterestBoardId) {
        toast('Select a Pinterest board before publishing.', 'error');
        return;
      }
    }
    const content = builder.activeTab
      ? (builder.platformBodies[builder.activeTab] ?? builder.mainBody)
      : builder.mainBody;
    if (!content.trim()) {
      toast('Write some content before publishing.', 'error');
      return;
    }
    toast('Publishing...', 'info');
    // Schedule 30 seconds in the future to pass server-side validation
    const publishDate = new Date(Date.now() + 30_000).toISOString();
    await handleSchedule(publishDate);
  };

  const handleSaveDraft = async () => {
    if (!builder.mainBody.trim() && Object.keys(builder.platformBodies).length === 0) {
      toast('Nothing to save — write some content first.', 'error');
      return;
    }
    try {
      await builder.saveAsDraft();
      toast('Draft saved!', 'success');
    } catch {
      toast('Failed to save draft.', 'error');
    }
  };

  return (
    <div className="flex h-full flex-col -m-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between border-b border-accent/10 bg-gradient-to-r from-surface-2 to-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <PenTool className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold text-text-primary hidden lg:block">
            Content Studio
          </h1>
          <h1 className="text-lg font-semibold text-text-primary lg:hidden">CB</h1>

          {/* Step indicator */}
          <div className="hidden md:flex ml-2">
            <StepIndicator flowState={effectiveFlowState} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Form Reset */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                builder.reset();
                chat.clearChat();
                setIsCopilotActive(false);
                setScheduleDate('');
                setCalendarRefreshKey((k) => k + 1);
              }}
              disabled={builder.isSaving}
              title="Reset Content Studio"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
          </div>

          {/* Save Draft */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveDraft}
              disabled={builder.isSaving || !builder.isDirty}
              title="Save Draft (Ctrl+S)"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {builder.isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            <span className="text-[10px] text-text-secondary mt-0.5 hidden lg:block">
              <Keyboard className="inline h-2.5 w-2.5 mr-0.5" />
              Ctrl+S
            </span>
          </div>
          {builder.selectedChannels.length >= 2 &&
            (builder.flowState === 'PLATFORMS_SELECTED' ||
              builder.flowState === 'ADAPTED' ||
              builder.flowState === 'MEDIA_ADDED' ||
              builder.flowState === 'READY') && (
              <div className="flex flex-col items-center" data-tour="adapt-all">
                {builder.flowState === 'ADAPTED' ||
                builder.flowState === 'MEDIA_ADDED' ||
                builder.flowState === 'READY' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={builder.adaptAll}
                    disabled={builder.isAdapting}
                    title="Re-adapt All (Ctrl+Shift+A)"
                  >
                    <Check className="mr-1.5 h-4 w-4 text-green-400" />
                    <span className="text-green-400">Adapted</span>
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={builder.adaptAll}
                    disabled={builder.isAdapting || builder.selectedChannels.length === 0}
                    title="Adapt All (Ctrl+Shift+A)"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    {builder.isAdapting ? 'Adapting...' : 'Adapt All'}
                  </Button>
                )}
                <span className="text-[10px] text-text-secondary mt-0.5 hidden lg:block">
                  <Keyboard className="inline h-2.5 w-2.5 mr-0.5" />
                  Ctrl+Shift+A
                </span>
              </div>
            )}

          {/* Right panel toggle moved inline to panel header */}
        </div>
      </div>

      {/* ─── Mobile step indicator (below header) ─── */}
      <div className="flex md:hidden items-center justify-center border-b border-border-subtle px-4 py-2 bg-surface-1/50">
        <StepIndicator flowState={effectiveFlowState} />
      </div>

      {/* ─── 3-Column Layout ─── */}
      {/*
       * Responsive breakpoints:
       *   xl (1280px+): 3 columns — left(260) + center(flex) + right(320)
       *   lg (1024-1280px): 2 columns — center(flex) + right(320), platforms inline
       *   below 1024px: 1 column, platforms inline, preview collapsed
       */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT COLUMN: Platform Selector (xl only) ─── */}
        {leftOpen ? (
          <div className="hidden xl:flex flex-shrink-0 flex-col border-r border-border-subtle bg-surface-1/50 transition-all duration-300 ease-in-out overflow-hidden w-[260px]">
            <div className="flex h-full w-[260px] flex-col">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div className="group relative flex items-center gap-1.5">
                  <span className="text-sm font-medium text-text-secondary">Platforms</span>
                  <Info className="h-3 w-3 text-text-tertiary/50 hover:text-accent transition-colors cursor-help" />
                  <div className="absolute left-0 top-full mt-2 z-50 w-56 rounded-lg bg-surface-3 border border-border-subtle shadow-dark-lg p-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
                    <p className="text-xs text-text-secondary leading-relaxed">
                      Choose where to publish. Select a platform, then pick the specific account or
                      page to post to.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">
                    {Object.values(builder.selectedAccounts).reduce(
                      (sum, ids) => sum + ids.length,
                      0,
                    ) || builder.selectedChannels.length}
                  </span>
                  <button
                    onClick={() => setLeftOpen(false)}
                    className="rounded-md p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-2/50 transition-colors"
                    aria-label="Collapse platforms panel"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <PlatformSelector
                  channels={channels}
                  selectedIds={builder.selectedChannels}
                  onToggle={builder.toggleChannel}
                  connectedPlatforms={connectedPlatforms}
                  layout="vertical"
                  accountsByChannel={accountsByChannel}
                  selectedAccounts={builder.selectedAccounts}
                  onToggleAccount={builder.toggleAccount}
                />
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLeftOpen(true)}
            className="hidden xl:flex flex-shrink-0 flex-col items-center gap-2 w-10 border-r border-border-subtle bg-surface-1/50 hover:bg-surface-2/50 py-4 transition-colors cursor-pointer group relative"
            aria-label="Expand platforms panel"
          >
            <PanelLeftClose className="h-4 w-4 text-text-tertiary group-hover:text-accent rotate-180 transition-colors" />
            <span className="text-[10px] text-text-tertiary group-hover:text-text-secondary font-medium tracking-wider [writing-mode:vertical-lr]">
              PLATFORMS
            </span>
            {builder.selectedChannels.length > 0 && (
              <span className="text-[9px] bg-accent/15 text-accent w-5 h-5 rounded-full flex items-center justify-center font-medium">
                {Object.values(builder.selectedAccounts).reduce(
                  (sum, ids) => sum + ids.length,
                  0,
                ) || builder.selectedChannels.length}
              </span>
            )}
            {/* Hover balloon */}
            <div className="absolute left-full top-3 ml-2 z-50 w-52 rounded-lg bg-surface-3 border border-border-subtle shadow-dark-lg p-3 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200">
              <p className="text-[11px] font-medium text-text-primary mb-1">Platforms</p>
              <p className="text-[10px] text-text-secondary leading-relaxed">
                Choose where to publish. Select a platform, then pick the specific account or page
                to post to.
              </p>
            </div>
          </button>
        )}

        {/* ─── CENTER COLUMN: AI Co-pilot + Editor + Media ─── */}
        <div
          className="flex flex-1 flex-col overflow-hidden bg-surface-0"
          style={{
            background:
              'radial-gradient(ellipse at center 40%, rgba(255,255,255,0.015) 0%, transparent 60%)',
          }}
        >
          {/* ─── IDLE: Full-width empty state ─── */}
          {!isCopilotActive && showEmptyState ? (
            <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
              <BuilderEmptyState
                onStartScratch={handleStartScratch}
                onOpenPrompts={handleOpenPrompts}
                onRepurpose={handleRepurpose}
                onQuickStart={handleQuickStart}
                isGenerating={isGeneratingTemplate}
              />
            </div>
          ) : (
            /* ─── COPILOT: Side-by-side AI + Editor ─── */
            <div className="flex flex-1 overflow-hidden">
              {/* Left: AI Conversation */}
              <div
                className="w-1/2 flex flex-col border-r border-border-subtle"
                data-tour="ai-assistant"
              >
                <CopilotChat
                  messages={chat.messages}
                  isSending={chat.isSending}
                  onSendMessage={(text) => {
                    setIsCopilotActive(true);
                    chat.sendMessage(text);
                  }}
                  isProcessing={builder.isProcessing}
                  activePromptId={builder.activePromptId}
                  activePromptName={builder.activePromptName}
                  isSendingPrompt={chat.isSending}
                  onSelectPrompt={handleSelectPrompt}
                  onClearPrompt={builder.clearPrompt}
                  onCreateNewPrompt={handleCreateNewPrompt}
                  prompts={promptsHook.prompts}
                  promptsLoading={promptsHook.loading}
                  onDeletePrompt={promptsHook.deletePrompt}
                  onEditPrompt={handleEditPrompt}
                  model={chat.model}
                  onModelChange={chat.setModel}
                  onApplyToEditor={handleApplyToEditor}
                />
              </div>

              {/* Right: Editor — stretches to match AI chat height */}
              <div className="w-1/2 flex flex-col overflow-y-auto px-4 py-4 min-h-0">
                {/* Inline platform selector — visible below xl */}
                <div className="xl:hidden mb-4" data-tour="platform-selector">
                  <PlatformSelector
                    channels={channels}
                    selectedIds={builder.selectedChannels}
                    onToggle={builder.toggleChannel}
                    connectedPlatforms={connectedPlatforms}
                    layout="horizontal"
                    accountsByChannel={accountsByChannel}
                    selectedAccounts={builder.selectedAccounts}
                    onToggleAccount={builder.toggleAccount}
                  />
                </div>

                {/* Main composer — grows to fill available space */}
                <div data-tour="composer" className="flex-1 flex flex-col">
                  <PostComposer
                    title={builder.title}
                    onTitleChange={builder.setTitle}
                    mainBody={builder.mainBody}
                    onMainBodyChange={builder.setMainBody}
                    platformBodies={builder.platformBodies}
                    onPlatformBodyChange={builder.setPlatformBody}
                    activeTab={builder.activeTab}
                    onTabChange={builder.setActiveTab}
                    selectedChannels={selectedChannelObjects}
                    imageUrl={builder.imageUrl}
                    onImageClick={handleImageClick}
                    isAdapting={builder.isAdapting}
                    onAdaptAll={builder.adaptAll}
                    flowState={builder.flowState}
                    pinterestBoardId={pinterestBoardId}
                    onPinterestBoardChange={(id, name) => {
                      setPinterestBoardId(id);
                      setPinterestBoardName(name);
                    }}
                    pinterestLink={pinterestLink}
                    onPinterestLinkChange={setPinterestLink}
                    youtubeTags={youtubeTags}
                    onYoutubeTagsChange={setYoutubeTags}
                    youtubePrivacy={youtubePrivacy}
                    onYoutubePrivacyChange={setYoutubePrivacy}
                    videoUrl={builder.videoUrl}
                  />
                  {builder.activeTab && (
                    <div className="mt-1.5 flex justify-end px-1">
                      <CharacterCountBar
                        text={builder.platformBodies[builder.activeTab] ?? builder.mainBody}
                        platformSlug={
                          selectedChannelObjects.find((ch) => ch.id === builder.activeTab)?.slug ??
                          null
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Media Studio — compact */}
                <div className="mt-3">
                  <MediaStudio
                    imageUrl={builder.imageUrl}
                    onImageChange={builder.setImageUrl}
                    videoUrl={builder.videoUrl}
                    onVideoChange={builder.setVideoUrl}
                    selectedChannels={selectedChannelObjects}
                    flowState={builder.flowState}
                    nudge={builder.flowState === 'ADAPTED'}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT COLUMN: Schedule ─── */}
        {rightOpen ? (
          <div className="hidden lg:flex flex-shrink-0 flex-col border-l border-border-subtle bg-surface-1 transition-all duration-300 ease-in-out overflow-hidden w-[320px]">
            <div className="flex h-full w-[320px] flex-col">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div className="group relative flex items-center gap-1.5">
                  <span className="text-sm font-medium text-text-secondary">Schedule</span>
                  <Info className="h-3 w-3 text-text-tertiary/50 hover:text-accent transition-colors cursor-help" />
                  <div className="absolute left-0 top-full mt-2 z-50 w-56 rounded-lg bg-surface-3 border border-border-subtle shadow-dark-lg p-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
                    <p className="text-xs text-text-secondary leading-relaxed">
                      Pick a date and time to publish, or post immediately. Your calendar shows all
                      upcoming scheduled posts.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRightOpen(false)}
                  className="rounded-md p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-2/50 transition-colors"
                  aria-label="Collapse schedule panel"
                >
                  <PanelRightClose className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <SchedulePanel
                  onSchedule={handleSchedule}
                  onPublishNow={handlePublishNow}
                  isSaving={builder.isSaving}
                  selectedChannelCount={
                    Object.values(builder.selectedAccounts).reduce(
                      (sum, ids) => sum + ids.length,
                      0,
                    ) || builder.selectedChannels.length
                  }
                  allAccountsSelected={
                    builder.selectedChannels.length > 0 &&
                    builder.selectedChannels.every(
                      (chId) => (builder.selectedAccounts[chId]?.length ?? 0) > 0,
                    )
                  }
                  flowState={builder.flowState}
                  scheduleDate={scheduleDate}
                  onScheduleDateChange={setScheduleDate}
                  refreshKey={calendarRefreshKey}
                />
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setRightOpen(true)}
            className="hidden lg:flex flex-shrink-0 flex-col items-center gap-2 w-10 border-l border-border-subtle bg-surface-1 hover:bg-surface-2/50 py-4 transition-colors cursor-pointer group relative"
            aria-label="Expand schedule panel"
          >
            <PanelRightClose className="h-4 w-4 text-text-tertiary group-hover:text-accent rotate-180 transition-colors" />
            <span className="text-[10px] text-text-tertiary group-hover:text-text-secondary font-medium tracking-wider [writing-mode:vertical-lr]">
              SCHEDULE
            </span>
            {scheduleDate && <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />}
            {/* Hover balloon */}
            <div className="absolute right-full top-3 mr-2 z-50 w-52 rounded-lg bg-surface-3 border border-border-subtle shadow-dark-lg p-3 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200">
              <p className="text-[11px] font-medium text-text-primary mb-1">Schedule</p>
              <p className="text-[10px] text-text-secondary leading-relaxed">
                Pick a date and time to publish, or post immediately. Your calendar shows all
                upcoming scheduled posts.
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Prompt Editor Modal */}
      <PromptEditorModal
        isOpen={promptModalOpen}
        onClose={() => {
          setPromptModalOpen(false);
          setEditingPrompt(null);
        }}
        onSave={handleSavePrompt}
        editPrompt={editingPrompt}
      />

      {/* Orchestration replace confirmation */}
      <Modal
        isOpen={showReplaceConfirm}
        onClose={handleCancelReplace}
        title="Replace current content?"
        confirmLabel="Replace"
        onConfirm={handleConfirmReplace}
      >
        <p>
          You have unsaved content in the editor. Loading workflow output will replace it. Save your
          current draft first if you want to keep it.
        </p>
      </Modal>
    </div>
  );
}
