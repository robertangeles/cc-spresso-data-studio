import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PenTool,
  Sparkles,
  Save,
  Keyboard,
  Check,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';
import { PlatformSelector } from '../components/content-builder/PlatformSelector';
import { PostComposer } from '../components/content-builder/PostComposer';
import { AICommandBar } from '../components/content-builder/AICommandBar';
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
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<{
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  } | null>(null);

  const builder = useContentBuilder();
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

  // Compute selected channel objects from IDs
  const selectedChannelObjects = channels.filter((ch) => builder.selectedChannels.includes(ch.id));

  // Handle prompt selection from PromptBadge — auto-send trigger to AI
  const handleSelectPrompt = useCallback(
    async (promptId: string, name: string, body: string) => {
      // Don't re-trigger if same prompt is already active
      if (promptId === builder.activePromptId) return;

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

  // Apply AI chat response content to the editor
  const handleApplyToEditor = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      const hadContent = !!builder.mainBody.trim();
      builder.setMainBody(content);
      if (hadContent) {
        toast('Previous draft replaced', 'info');
      } else {
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

  // AI Command handler
  const handleAICommand = useCallback(
    async (instruction: string) => {
      // Get current content from active editor
      const currentContent = builder.activeTab
        ? (builder.platformBodies[builder.activeTab] ?? '')
        : builder.mainBody;

      // Build platform-aware instruction
      const activeChannel = builder.activeTab
        ? selectedChannelObjects.find((ch) => ch.id === builder.activeTab)
        : null;

      const charLimit = activeChannel ? (activeChannel.config?.charLimit as number) || 0 : 0;
      const platformName = activeChannel?.name ?? 'general';

      const enhancedInstruction = [
        `You are a content writer. Return ONLY the post content — no preamble, no explanations, no separators, no quotation marks. Just the ready-to-publish text.`,
        charLimit > 0
          ? `STRICT CHARACTER LIMIT: ${charLimit} characters maximum for ${platformName}.`
          : '',
        instruction,
      ]
        .filter(Boolean)
        .join('\n\n');

      // Store previous content for undo
      builder.storePreviousContent();
      builder.setProcessing(true);

      try {
        const result = await chat.executeCommand(
          enhancedInstruction,
          currentContent,
          builder.activePromptBody,
        );

        // Replace the active editor content with AI result
        if (builder.activeTab) {
          builder.setPlatformBody(builder.activeTab, result);
        } else {
          builder.setMainBody(result);
        }

        // Add to command history
        builder.addCommand(instruction);

        toast('AI content applied. Ctrl+Z to undo.', 'success');
      } catch {
        toast('AI command failed. Please try again.', 'error');
      } finally {
        builder.setProcessing(false);
      }
    },
    [builder, chat, toast, selectedChannelObjects],
  );

  // Whether to show the empty state
  const showEmptyState =
    builder.selectedChannels.length === 0 && !builder.mainBody.trim() && !builder.title.trim();

  // Empty state handlers
  const handleStartScratch = () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea) textarea.focus();
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
        status: 'draft',
      });
      const items = batchData.data ?? [];
      let totalScheduled = 0;
      for (const item of items) {
        const accountIds = builder.selectedAccounts[item.channelId];
        if (accountIds && accountIds.length > 0) {
          // Schedule once per selected account
          for (const socialAccountId of accountIds) {
            await api.post('/schedule', {
              contentItemId: item.id,
              channelId: item.channelId,
              socialAccountId,
              scheduledAt: date,
            });
            totalScheduled++;
          }
        } else {
          // Fallback: no explicit account selection (legacy behavior)
          await api.post('/schedule', {
            contentItemId: item.id,
            channelId: item.channelId,
            scheduledAt: date,
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
            Content Builder
          </h1>
          <h1 className="text-lg font-semibold text-text-primary lg:hidden">CB</h1>

          {/* Step indicator */}
          <div className="hidden md:flex ml-2">
            <StepIndicator flowState={builder.flowState} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Panel toggles — visible at xl breakpoint */}
          <button
            onClick={() => setLeftOpen((v) => !v)}
            className="hidden xl:flex items-center justify-center rounded-lg p-1.5 text-text-tertiary bg-surface-2/50 border border-white/5 hover:bg-surface-3 hover:text-text-secondary transition-all duration-200"
            aria-label={leftOpen ? 'Collapse platforms panel' : 'Expand platforms panel'}
            title="Toggle platforms panel"
          >
            <PanelLeftClose
              className={`h-4 w-4 transition-transform ${!leftOpen ? 'rotate-180' : ''}`}
            />
          </button>

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

          <button
            onClick={() => setRightOpen((v) => !v)}
            className="hidden xl:flex items-center justify-center rounded-lg p-1.5 text-text-tertiary bg-surface-2/50 border border-white/5 hover:bg-surface-3 hover:text-text-secondary transition-all duration-200"
            aria-label={rightOpen ? 'Collapse preview panel' : 'Expand preview panel'}
            title="Toggle preview panel"
          >
            <PanelRightClose
              className={`h-4 w-4 transition-transform ${!rightOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* ─── Mobile step indicator (below header) ─── */}
      <div className="flex md:hidden items-center justify-center border-b border-border-subtle px-4 py-2 bg-surface-1/50">
        <StepIndicator flowState={builder.flowState} />
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
        <div
          className={`hidden xl:flex flex-shrink-0 flex-col border-r border-border-subtle bg-surface-1/50 transition-all duration-300 ease-in-out overflow-hidden ${
            leftOpen ? 'w-[260px]' : 'w-0'
          }`}
        >
          <div className="flex h-full w-[260px] flex-col">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="text-sm font-medium text-text-secondary">Platforms</span>
              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">
                {Object.values(builder.selectedAccounts).reduce(
                  (sum, ids) => sum + ids.length,
                  0,
                ) || builder.selectedChannels.length}
              </span>
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

        {/* ─── CENTER COLUMN: AI Co-pilot + Editor + Media ─── */}
        <div
          className="flex flex-1 flex-col overflow-hidden bg-surface-0"
          style={{
            background:
              'radial-gradient(ellipse at center 40%, rgba(255,255,255,0.015) 0%, transparent 60%)',
          }}
        >
          {/* AI Command Bar — promoted to top (co-pilot position) */}
          <div
            className="border-b border-border-subtle px-4 py-3 bg-surface-1/30 backdrop-blur-sm"
            data-tour="ai-assistant"
          >
            <AICommandBar
              onCommand={handleAICommand}
              isProcessing={builder.isProcessing}
              isSending={chat.isSending}
              commandHistory={builder.commandHistory}
              model={chat.model}
              onModelChange={chat.setModel}
              activePromptId={builder.activePromptId}
              activePromptName={builder.activePromptName}
              onSelectPrompt={handleSelectPrompt}
              onClearPrompt={builder.clearPrompt}
              onCreateNewPrompt={handleCreateNewPrompt}
              prompts={promptsHook.prompts}
              promptsLoading={promptsHook.loading}
              onDeletePrompt={promptsHook.deletePrompt}
              onEditPrompt={handleEditPrompt}
              onRegenerate={handleAICommand}
            />
          </div>

          {/* Scrollable editor area */}
          <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
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

            {showEmptyState ? (
              <BuilderEmptyState
                onStartScratch={handleStartScratch}
                onOpenPrompts={handleOpenPrompts}
                onRepurpose={handleRepurpose}
                onQuickStart={handleQuickStart}
                isGenerating={isGeneratingTemplate}
              />
            ) : (
              <>
                {/* Main composer */}
                <div data-tour="composer">
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
                    selectedChannels={selectedChannelObjects}
                    flowState={builder.flowState}
                    nudge={builder.flowState === 'ADAPTED'}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Schedule ─── */}
        <div
          className={`hidden lg:flex flex-shrink-0 flex-col border-l border-border-subtle bg-surface-1 transition-all duration-300 ease-in-out overflow-hidden ${
            rightOpen ? 'w-[320px]' : 'w-0'
          }`}
        >
          <div className="flex h-full w-[320px] flex-col">
            {/* AI Chat — read-only message transcript */}
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
              <span className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                AI Chat
              </span>
            </div>
            <div className="border-b border-border-subtle max-h-[300px] overflow-y-auto scrollbar-thin">
              {chat.messages.length === 0 && !chat.isSending ? (
                <p className="text-xs text-text-tertiary text-center py-6 px-3">
                  Select a prompt or type in the AI bar above to start.
                </p>
              ) : (
                <div className="px-3 py-2.5 space-y-2">
                  {chat.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[90%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                        <div
                          className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-accent-dim text-text-primary'
                              : 'bg-surface-2 text-text-primary'
                          }`}
                        >
                          {msg.role === 'assistant' && (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent mr-1.5 align-middle" />
                          )}
                          <span className="whitespace-pre-wrap inline">
                            {msg.content.length > 500
                              ? msg.content.slice(0, 500) + '...'
                              : msg.content}
                          </span>
                        </div>
                        {msg.role === 'assistant' && (
                          <button
                            type="button"
                            onClick={() => handleApplyToEditor(msg.content)}
                            className="mt-1 inline-flex items-center gap-1 rounded-full text-[10px] px-2.5 py-0.5 font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-all"
                          >
                            <PenTool className="h-2.5 w-2.5" />
                            Apply to editor
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {chat.isSending && (
                    <div className="flex justify-start">
                      <div className="bg-surface-2 rounded-lg p-2.5 flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-xs text-text-tertiary italic">Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Schedule Panel */}
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
              <span className="text-sm font-medium text-text-secondary">Schedule</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <SchedulePanel
                onSchedule={handleSchedule}
                onPublishNow={handlePublishNow}
                onSaveDraft={handleSaveDraft}
                isSaving={builder.isSaving}
                selectedChannelCount={
                  Object.values(builder.selectedAccounts).reduce(
                    (sum, ids) => sum + ids.length,
                    0,
                  ) || builder.selectedChannels.length
                }
                flowState={builder.flowState}
                scheduleDate={scheduleDate}
                onScheduleDateChange={setScheduleDate}
                refreshKey={calendarRefreshKey}
              />
            </div>
          </div>
        </div>
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
    </div>
  );
}
