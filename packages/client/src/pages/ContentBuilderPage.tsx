import { useState, useEffect, useCallback } from 'react';
import {
  PenTool,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Save,
  PanelLeftClose,
  PanelRightClose,
  Keyboard,
  Check,
} from 'lucide-react';
import { PlatformSelector } from '../components/content-builder/PlatformSelector';
import { PostComposer } from '../components/content-builder/PostComposer';
import { MiniChat } from '../components/content-builder/MiniChat';
import { PromptLibrary } from '../components/content-builder/PromptLibrary';
import { PlatformPreview } from '../components/content-builder/PlatformPreview';
import { SchedulePanel } from '../components/content-builder/SchedulePanel';
import { BuilderEmptyState } from '../components/content-builder/BuilderEmptyState';
import MediaStudio from '../components/content-builder/MediaStudio';
import { PromptEditorModal } from '../components/content-builder/PromptEditorModal';
import { useContentBuilder } from '../hooks/useContentBuilder';
import { usePrompts } from '../hooks/usePrompts';
import { useContentChat } from '../hooks/useContentChat';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';

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
  const chat = useContentChat();
  const { user } = useAuth();

  const userName = user?.name ?? 'User';

  // Fetch available channels on mount
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
    fetchChannels();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard shortcuts
  const handleKeyboard = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ctrl+S / Cmd+S → save draft
      if (e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (builder.isDirty && !builder.isSaving) builder.saveAsDraft();
        return;
      }
      // Ctrl+Shift+A / Cmd+Shift+A → adapt all
      if (e.key === 'A' && e.shiftKey) {
        e.preventDefault();
        if (!builder.isAdapting && builder.selectedChannels.length > 0) builder.adaptAll();
        return;
      }
      // Ctrl+Shift+S / Cmd+Shift+S → focus schedule input
      if (e.key === 'S' && e.shiftKey) {
        e.preventDefault();
        const scheduleInput = document.querySelector<HTMLInputElement>(
          'input[type="datetime-local"], input[type="date"]',
        );
        if (scheduleInput) scheduleInput.focus();
        return;
      }
    },
    [builder],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  // Compute selected channel objects from IDs
  const selectedChannelObjects = channels.filter((ch) => builder.selectedChannels.includes(ch.id));

  // Map prompts from usePrompts to the shape PromptLibrary expects
  const promptLibraryPrompts = promptsHook.prompts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category ?? 'custom',
    defaultModel: p.defaultModel,
    currentVersion: p.currentVersion,
  }));

  // PromptLibrary's onSelectPrompt expects (promptId, body)
  const handleSelectPrompt = (promptId: string, _body: string) => {
    builder.loadPrompt(promptId);
  };

  const handleCreateNewPrompt = () => {
    setEditingPrompt(null);
    setPromptModalOpen(true);
  };

  const handleSavePrompt = async (data: {
    name: string;
    description: string;
    body: string;
    category: string;
    defaultModel: string;
  }) => {
    if (editingPrompt) {
      await promptsHook.updatePrompt(editingPrompt.id, data);
    } else {
      await promptsHook.createPrompt(data);
    }
    setPromptModalOpen(false);
    setEditingPrompt(null);
  };

  // Whether to show the empty state
  const showEmptyState =
    builder.selectedChannels.length === 0 && !builder.mainBody.trim() && !builder.title.trim();

  // Empty state handlers
  const handleStartScratch = () => {
    // Focus the composer textarea
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea) textarea.focus();
  };

  const handleOpenPrompts = () => {
    setLeftOpen(true);
  };

  const handleRepurpose = () => {
    // TODO: navigate to content library
  };

  // Image click handler (toggle or open picker)
  const handleImageClick = () => {
    if (builder.imageUrl) {
      builder.setImageUrl(null);
    }
    // TODO: open image picker when no image
  };

  // Schedule handlers
  const handleSchedule = (_date: string) => {
    // TODO: implement scheduling via API
  };

  const handlePublishNow = () => {
    // TODO: implement publish via API
  };

  return (
    <div className="flex h-full flex-col -m-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-accent/10 bg-gradient-to-r from-surface-2 to-surface-1 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <PenTool className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">Content Builder</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={builder.saveAsDraft}
              disabled={builder.isSaving || !builder.isDirty}
              title="Save Draft (Ctrl+S)"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {builder.isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            <span className="text-[9px] text-text-tertiary mt-0.5 hidden lg:block">
              <Keyboard className="inline h-2.5 w-2.5 mr-0.5" />
              Ctrl+S
            </span>
          </div>
          {(builder.flowState === 'PLATFORMS_SELECTED' ||
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
              <span className="text-[9px] text-text-tertiary mt-0.5 hidden lg:block">
                <Keyboard className="inline h-2.5 w-2.5 mr-0.5" />
                Ctrl+Shift+A
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 px-6 py-2 bg-surface-1/50 border-b border-border-subtle">
        {['Write', 'Platforms', 'Adapt', 'Media', 'Schedule'].map((label, i) => {
          const states = ['WRITING', 'PLATFORMS_SELECTED', 'ADAPTED', 'MEDIA_ADDED', 'READY'];
          const stateIndex = states.indexOf(builder.flowState);
          const isActive = i <= stateIndex;
          const isCurrent = i === stateIndex || (i === 0 && builder.flowState === 'IDLE');
          return (
            <div key={label} className="flex items-center">
              {i > 0 && (
                <div
                  className={`w-12 h-0.5 ${isActive ? 'bg-accent' : 'bg-surface-3'} transition-colors duration-500`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                    isCurrent
                      ? 'bg-accent shadow-[0_0_8px_rgba(255,214,10,0.4)] scale-125'
                      : isActive
                        ? 'bg-accent'
                        : 'bg-surface-3'
                  }`}
                />
                <span
                  className={`text-[9px] font-medium transition-colors ${
                    isCurrent
                      ? 'text-accent'
                      : isActive
                        ? 'text-text-secondary'
                        : 'text-text-tertiary'
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Three-panel layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Prompt Library ── */}
        <div
          className={`relative flex-shrink-0 border-r border-border-subtle bg-surface-1 transition-all duration-300 ease-in-out ${
            leftOpen ? 'w-[280px]' : 'w-0'
          } overflow-hidden`}
        >
          <div className="flex h-full w-[280px] flex-col">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="text-sm font-medium text-text-secondary">Prompt Library</span>
              <button
                onClick={() => setLeftOpen(false)}
                className="rounded-lg p-1.5 text-text-tertiary bg-surface-2/50 backdrop-blur-sm border border-white/5 hover:bg-surface-3 hover:text-text-secondary transition-all duration-200"
                aria-label="Collapse prompt library"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" data-tour="prompt-library">
              <PromptLibrary
                prompts={promptLibraryPrompts}
                loading={promptsHook.loading}
                category={promptsHook.category}
                onCategoryChange={promptsHook.setCategory}
                onSelectPrompt={handleSelectPrompt}
                onCreateNew={handleCreateNewPrompt}
              />
            </div>
          </div>
        </div>

        {/* Left collapse toggle (visible when collapsed) */}
        {!leftOpen && (
          <button
            onClick={() => setLeftOpen(true)}
            className="flex-shrink-0 border-r border-border-subtle bg-surface-1 px-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-secondary transition-all duration-200 shadow-[0_0_8px_rgba(255,214,10,0.06)]"
            aria-label="Expand prompt library"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* ── Center Panel: Composer + Chat ── */}
        <div
          className="flex flex-1 flex-col overflow-hidden bg-surface-0"
          style={{
            background:
              'radial-gradient(ellipse at center 40%, rgba(255,255,255,0.015) 0%, transparent 60%)',
          }}
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Platform chip selector */}
            <div data-tour="platform-selector">
              <PlatformSelector
                channels={channels}
                selectedIds={builder.selectedChannels}
                onToggle={builder.toggleChannel}
              />
            </div>

            {showEmptyState ? (
              <BuilderEmptyState
                onStartScratch={handleStartScratch}
                onOpenPrompts={handleOpenPrompts}
                onRepurpose={handleRepurpose}
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
                </div>

                {/* Media Studio — image/video generation + upload */}
                <div className="mt-4">
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

          {/* Inline mini-chat below composer */}
          <div className="flex-shrink-0 border-t border-border-subtle" data-tour="ai-assistant">
            <MiniChat
              messages={chat.messages}
              isSending={chat.isSending}
              onSendMessage={chat.sendMessage}
              onInsert={builder.insertFromChat}
              model={chat.model}
              onModelChange={chat.setModel}
            />
          </div>
        </div>

        {/* Right collapse toggle (visible when collapsed) */}
        {!rightOpen && (
          <button
            onClick={() => setRightOpen(true)}
            className="flex-shrink-0 border-l border-border-subtle bg-surface-1 px-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-secondary transition-all duration-200 shadow-[0_0_8px_rgba(255,214,10,0.06)]"
            aria-label="Expand preview panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* ── Right Panel: Preview + Schedule ── */}
        <div
          className={`relative flex-shrink-0 border-l border-border-subtle bg-surface-1 transition-all duration-300 ease-in-out ${
            rightOpen ? 'w-[320px]' : 'w-0'
          } overflow-hidden`}
        >
          <div className="flex h-full w-[320px] flex-col">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="text-sm font-medium text-text-secondary">Preview & Schedule</span>
              <button
                onClick={() => setRightOpen(false)}
                className="rounded-lg p-1.5 text-text-tertiary bg-surface-2/50 backdrop-blur-sm border border-white/5 hover:bg-surface-3 hover:text-text-secondary transition-all duration-200"
                aria-label="Collapse preview panel"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PlatformPreview
                selectedChannels={selectedChannelObjects}
                title={builder.title}
                mainBody={builder.mainBody}
                platformBodies={builder.platformBodies}
                imageUrl={builder.imageUrl}
                userName={userName}
              />
              <div className="border-t border-border-subtle" data-tour="schedule">
                <SchedulePanel
                  onSchedule={handleSchedule}
                  onPublishNow={handlePublishNow}
                  onSaveDraft={builder.saveAsDraft}
                  isSaving={builder.isSaving}
                  selectedChannelCount={builder.selectedChannels.length}
                  flowState={builder.flowState}
                />
              </div>
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
