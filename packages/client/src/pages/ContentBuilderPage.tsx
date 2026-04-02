import { useState, useEffect, useCallback, useMemo } from 'react';
import { PenTool, Wand2, Send, Loader2 } from 'lucide-react';
import { PlatformPillBar } from '../components/content-builder/PlatformPillBar';
import { PostComposer } from '../components/content-builder/PostComposer';
import { CharacterCountBar } from '../components/content-builder/CharacterCountBar';
import { BuilderEmptyState } from '../components/content-builder/BuilderEmptyState';
import MediaStudio from '../components/content-builder/MediaStudio';
import { PromptEditorModal } from '../components/content-builder/PromptEditorModal';
import { ActionBar } from '../components/content-builder/ActionBar';
import { ChatDrawer } from '../components/content-builder/ChatDrawer';
import { ScheduleDrawer } from '../components/content-builder/ScheduleDrawer';
import { useContentBuilder } from '../hooks/useContentBuilder';
import { usePrompts } from '../hooks/usePrompts';
import { useContentChat } from '../hooks/useContentChat';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { isContentResponse, synthesizeTriggerMessage } from '../utils/contentDetection';

interface Channel {
  id: string;
  name: string;
  slug: string;
  icon: string;
  config: Record<string, unknown>;
}

/** Inline AI command bar — the magic wand that lives between content and actions */
function InlineAIBar({
  onSubmit,
  isProcessing,
}: {
  onSubmit: (text: string) => void;
  isProcessing: boolean;
}) {
  const [input, setInput] = useState('');
  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    onSubmit(input.trim());
    setInput('');
  };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  return (
    <div className="shrink-0 px-6 lg:px-10 py-3 relative">
      {/* Ambient glow behind the bar */}
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent" />
      <div className="max-w-4xl ai-bar rounded-2xl px-4 py-3 flex items-center gap-3">
        {/* Animated wand icon */}
        <div
          className={`flex items-center justify-center h-8 w-8 rounded-xl shrink-0 transition-all duration-300 ${
            isProcessing
              ? 'bg-accent/20 animate-pulse'
              : 'bg-gradient-to-br from-accent/15 to-amber-600/10'
          }`}
        >
          <Wand2 className={`h-4 w-4 text-accent ${isProcessing ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask AI to help — make it shorter, add emojis, change tone..."
            disabled={isProcessing}
            className="flex-1 bg-transparent border-none text-sm text-text-primary placeholder:text-text-tertiary/40 focus:outline-none disabled:opacity-50 font-editor"
          />
          <span className="text-[9px] text-text-tertiary/40 font-mono">Enter to send</span>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className={`shrink-0 rounded-xl px-3 py-2 transition-all duration-300 ease-spring ${
            isProcessing
              ? 'bg-accent/20 text-accent'
              : input.trim()
                ? 'bg-gradient-to-r from-accent to-amber-600 text-text-inverse shadow-[0_0_15px_rgba(255,214,10,0.15)] hover:shadow-[0_0_25px_rgba(255,214,10,0.25)] hover:scale-[1.05] active:scale-[0.95]'
                : 'bg-surface-3/30 text-text-tertiary/30'
          }`}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function ContentBuilderPage() {
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'schedule' | null>(null);
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
        if (!cancelled) setChannels(data.data ?? data);
      } catch {
        /* Channels will remain empty */
      }
    }
    async function fetchConnected() {
      try {
        const { data } = await api.get('/oauth/connected');
        if (!cancelled) setConnectedPlatforms(data.data ?? []);
      } catch {
        /* Connected platforms will remain empty */
      }
    }
    async function fetchAccounts() {
      try {
        const { data } = await api.get('/oauth/accounts');
        if (!cancelled) setSocialAccounts(data.data ?? []);
      } catch {
        /* Social accounts will remain empty */
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

      // Ctrl+S -> save draft
      if (e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (builder.isDirty && !builder.isSaving) builder.saveAsDraft();
        return;
      }
      // Ctrl+Shift+A -> adapt all
      if (e.key === 'A' && e.shiftKey) {
        e.preventDefault();
        if (!builder.isAdapting && builder.selectedChannels.length >= 2) builder.adaptAll();
        return;
      }
      // Ctrl+Shift+S -> toggle schedule drawer
      if (e.key === 'S' && e.shiftKey) {
        e.preventDefault();
        setActiveDrawer((d) => (d === 'schedule' ? null : 'schedule'));
        return;
      }
      // Ctrl+/ -> toggle chat drawer
      if (e.key === '/') {
        e.preventDefault();
        setActiveDrawer((d) => (d === 'chat' ? null : 'chat'));
        return;
      }
      // Ctrl+Z -> undo last AI command
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
      if (promptId === builder.activePromptId) return;

      const hadContent = !!builder.mainBody.trim();
      builder.loadPrompt(promptId, name, body);
      chat.clearChat();

      if (!body?.trim()) {
        toast(`Prompt loaded: ${name}`, 'success');
        return;
      }

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
    setEditingPrompt(prompt);
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

  // AI Command handler — sends through unified chat with editor context
  const handleAICommand = useCallback(
    async (instruction: string) => {
      const currentContent = builder.activeTab
        ? (builder.platformBodies[builder.activeTab] ?? '')
        : builder.mainBody;

      const activeChannel = builder.activeTab
        ? selectedChannelObjects.find((ch) => ch.id === builder.activeTab)
        : null;

      const charLimit = activeChannel ? (activeChannel.config?.charLimit as number) || 0 : 0;
      const platformName = activeChannel?.name ?? 'general';

      const contextParts = [
        'You are a content writer. Return ONLY the post content — no preamble, no explanations, no separators, no quotation marks. Just the ready-to-publish text.',
        charLimit > 0
          ? `STRICT CHARACTER LIMIT: ${charLimit} characters maximum for ${platformName}.`
          : '',
        currentContent.trim()
          ? `The user has written the following content:\n---\n${currentContent}\n---\n\nInstruction: ${instruction}`
          : instruction,
      ]
        .filter(Boolean)
        .join('\n\n');

      builder.storePreviousContent();
      builder.setProcessing(true);

      try {
        const result = await chat.sendMessage(contextParts, {
          displayContent: instruction,
          systemPromptOverride: builder.activePromptBody,
        });

        if (result) {
          if (builder.activeTab) {
            builder.setPlatformBody(builder.activeTab, result);
          } else {
            builder.setMainBody(result);
          }
          builder.addCommand(instruction);
          toast('AI content applied. Ctrl+Z to undo.', 'success');
        }
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
    // Focus the editor — content will start flowing
  };

  const handleOpenPrompts = () => {
    setActiveDrawer('chat');
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
    if (builder.imageUrl) builder.setImageUrl(null);
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
      setActiveDrawer(null);
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

  const handleToggleDrawer = useCallback((drawer: 'chat' | 'schedule') => {
    setActiveDrawer((d) => (d === drawer ? null : drawer));
  }, []);

  const selectedAccountCount =
    Object.values(builder.selectedAccounts).reduce((sum, ids) => sum + ids.length, 0) ||
    builder.selectedChannels.length;

  return (
    <div className="flex h-full flex-col -m-6">
      {/* ─── Header — premium branding bar ─── */}
      <div className="relative flex items-center border-b border-white/[0.04] px-6 py-3 overflow-hidden">
        {/* Ambient gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-surface-2 via-surface-1 to-surface-2" />
        <div className="absolute inset-0 bg-gradient-to-r from-accent/[0.03] via-transparent to-accent/[0.02]" />
        {/* Bottom accent line */}
        <div className="absolute bottom-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-accent/10 border border-accent/15">
            <PenTool className="h-3.5 w-3.5 text-accent" />
          </div>
          <h1 className="text-base font-heading font-bold tracking-tight bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent">
            Content Builder
          </h1>
        </div>
      </div>

      {/* ─── Main Content: Single Centered Column with atmospheric depth ─── */}
      <div className="flex-1 overflow-y-auto page-spotlight">
        {showEmptyState ? (
          <div className="max-w-4xl px-6 lg:px-10 py-8">
            <BuilderEmptyState
              onStartScratch={handleStartScratch}
              onOpenPrompts={handleOpenPrompts}
              onRepurpose={handleRepurpose}
              onQuickStart={handleQuickStart}
              isGenerating={isGeneratingTemplate}
            />
          </div>
        ) : (
          <div className="max-w-4xl px-6 lg:px-10 py-8 animate-fade-in relative z-[1]">
            {/* ─── Unified Editor Surface (platforms + editor + media in one card) ─── */}
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
                headerSlot={
                  <PlatformPillBar
                    channels={channels}
                    selectedIds={builder.selectedChannels}
                    onToggle={builder.toggleChannel}
                    connectedPlatforms={connectedPlatforms}
                    accountsByChannel={accountsByChannel}
                    selectedAccounts={builder.selectedAccounts}
                    onToggleAccount={builder.toggleAccount}
                  />
                }
                mediaSlot={
                  <MediaStudio
                    imageUrl={builder.imageUrl}
                    onImageChange={builder.setImageUrl}
                    selectedChannels={selectedChannelObjects}
                    flowState={builder.flowState}
                    nudge={builder.flowState === 'ADAPTED'}
                  />
                }
              />
              {builder.activeTab && (
                <div className="mt-1.5 flex justify-end px-1">
                  <CharacterCountBar
                    text={builder.platformBodies[builder.activeTab] ?? builder.mainBody}
                    platformSlug={
                      selectedChannelObjects.find((ch) => ch.id === builder.activeTab)?.slug ?? null
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Inline AI Command Bar (page-level, always visible) ─── */}
      {!showEmptyState && (
        <InlineAIBar onSubmit={handleAICommand} isProcessing={builder.isProcessing} />
      )}

      {/* ─── Sticky Action Bar ─── */}
      <ActionBar
        activeDrawer={activeDrawer}
        onToggleDrawer={handleToggleDrawer}
        onSaveDraft={handleSaveDraft}
        onPublishNow={handlePublishNow}
        isSaving={builder.isSaving}
        isDirty={builder.isDirty}
        flowState={builder.flowState}
        selectedChannelCount={selectedAccountCount}
        isAdapting={builder.isAdapting}
        onAdaptAll={builder.adaptAll}
      />

      {/* ─── Chat Drawer ─── */}
      <ChatDrawer
        isOpen={activeDrawer === 'chat'}
        onClose={() => setActiveDrawer(null)}
        messages={chat.messages}
        isSending={chat.isSending}
        onSendMessage={(text) => handleAICommand(text)}
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

      {/* ─── Schedule Drawer ─── */}
      <ScheduleDrawer
        isOpen={activeDrawer === 'schedule'}
        onClose={() => setActiveDrawer(null)}
        onSchedule={handleSchedule}
        onPublishNow={handlePublishNow}
        onSaveDraft={handleSaveDraft}
        isSaving={builder.isSaving}
        selectedChannelCount={selectedAccountCount}
        flowState={builder.flowState}
        scheduleDate={scheduleDate}
        onScheduleDateChange={setScheduleDate}
        refreshKey={calendarRefreshKey}
      />

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
