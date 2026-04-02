import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent, useChannels } from '../hooks/useContent';
import type { ContentItem, Channel } from '../hooks/useContent';
import { ContentCard } from '../components/content/ContentCard';
import { ContentEditor } from '../components/content/ContentEditor';
import { PlatformCoverageBar } from '../components/content/PlatformCoverageBar';
import { RemixModal } from '../components/content/RemixModal';
import { RepurposeModal } from '../components/content/RepurposeModal';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { getPlatformColor } from '../components/content/PlatformPicker';
import {
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
  FileText,
  X,
  CheckSquare,
  Square,
  Sparkles,
  Keyboard,
  Import,
} from 'lucide-react';

/* ─── Constants ───────────────────────────────── */

const ORCHESTRATION_RELAY_KEY = 'spresso_orchestration_relay';

/* ─── Group items by channel ──────────────────── */
interface PlatformGroup {
  channelId: string | null;
  channel: Channel | undefined;
  items: ContentItem[];
  color: string;
}

function groupByPlatform(items: ContentItem[], channels: Channel[]): PlatformGroup[] {
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const groups = new Map<string, PlatformGroup>();

  for (const item of items) {
    const key = item.channelId ?? '__uncategorized__';
    if (!groups.has(key)) {
      const channel = item.channelId ? channelMap.get(item.channelId) : undefined;
      groups.set(key, {
        channelId: item.channelId,
        channel,
        items: [],
        color: channel ? getPlatformColor(channel.slug) : '#6B7280',
      });
    }
    groups.get(key)!.items.push(item);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (!a.channel) return 1;
    if (!b.channel) return -1;
    return a.channel.name.localeCompare(b.channel.name);
  });
}

/* ─── Main component ──────────────────────────── */
export function ContentLibraryPage() {
  const navigate = useNavigate();
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'single'; id: string } | { type: 'bulk' } | null
  >(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [remixOpen, setRemixOpen] = useState(false);
  const [remixSources, setRemixSources] = useState<ContentItem[]>([]);
  const [repurposeOpen, setRepurposeOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { items, isLoading, refresh, updateItem, deleteItem, deleteBatch } = useContent({
    channelId: channelFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const channels = useChannels();

  const groups = useMemo(() => groupByPlatform(items, channels), [items, channels]);
  const totalCount = items.length;
  const selectedCount = selectedIds.size;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  // Build source title lookup for lineage badges
  const sourceTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(item.id, item.title);
    }
    return map;
  }, [items]);

  /* ─── Selection ─────────────────────────── */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(isAllSelected ? new Set() : new Set(items.map((i) => i.id)));
  }, [isAllSelected, items]);

  const toggleGroupSelect = useCallback(
    (group: PlatformGroup) => {
      const groupIds = group.items.map((i) => i.id);
      const allGroupSelected = groupIds.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (allGroupSelected) groupIds.forEach((id) => next.delete(id));
        else groupIds.forEach((id) => next.add(id));
        return next;
      });
    },
    [selectedIds],
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ─── Delete ────────────────────────────── */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'single') {
      await deleteItem(deleteTarget.id);
      selectedIds.delete(deleteTarget.id);
      setSelectedIds(new Set(selectedIds));
    } else {
      await deleteBatch(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
    setDeleteTarget(null);
  };

  /* ─── Remix ─────────────────────────────── */
  const openRemixForSelection = useCallback(() => {
    const sources = items.filter((i) => selectedIds.has(i.id));
    if (sources.length === 0) return;
    setRemixSources(sources);
    setRemixOpen(true);
  }, [items, selectedIds]);

  const openRemixForItem = useCallback((item: ContentItem) => {
    setRemixSources([item]);
    setRemixOpen(true);
  }, []);

  const handleDeepRemix = useCallback(
    (config: {
      sourceItems: ContentItem[];
      targetChannelIds: string[];
      style: string;
      customPrompt?: string;
    }) => {
      // Check if Studio has unsaved content
      const existing = localStorage.getItem(ORCHESTRATION_RELAY_KEY);
      if (existing) {
        const proceed = window.confirm(
          'You have unsaved work in Content Studio. Opening remix will replace it. Continue?',
        );
        if (!proceed) return;
      }

      // Set relay payload for Studio
      const relay = {
        title:
          config.sourceItems.length === 1
            ? `${config.sourceItems[0].title} (remix)`
            : 'Remixed content',
        mainBody: config.sourceItems.map((i) => i.body).join('\n\n---\n\n'),
        imageUrl: null,
        platformBodies: {},
        channels: config.targetChannelIds,
        orchestrationName: 'Remix',
        fieldCount: config.sourceItems.length,
        timestamp: Date.now(),
        remixContext: {
          sourceItems: config.sourceItems.map((i) => ({
            id: i.id,
            title: i.title,
            body: i.body.slice(0, 500),
            channelId: i.channelId,
          })),
          targetChannelIds: config.targetChannelIds,
          style: config.style,
          customPrompt: config.customPrompt,
        },
      };

      localStorage.setItem(ORCHESTRATION_RELAY_KEY, JSON.stringify(relay));
      setRemixOpen(false);
      navigate('/content?from=orchestration');
    },
    [navigate],
  );

  const handleDeepRepurpose = useCallback(
    (config: {
      sourceText: string;
      sourceUrl?: string;
      targetChannelIds: string[];
      style: string;
      customPrompt?: string;
    }) => {
      const existing = localStorage.getItem(ORCHESTRATION_RELAY_KEY);
      if (existing) {
        const proceed = window.confirm(
          'You have unsaved work in Content Studio. Opening repurposed content will replace it. Continue?',
        );
        if (!proceed) return;
      }

      const relay = {
        title: config.sourceUrl
          ? `Repurposed from ${new URL(config.sourceUrl).hostname}`
          : 'Repurposed content',
        mainBody: config.sourceText,
        imageUrl: null,
        platformBodies: {},
        channels: config.targetChannelIds,
        orchestrationName: 'Repurpose',
        fieldCount: 1,
        timestamp: Date.now(),
      };

      localStorage.setItem(ORCHESTRATION_RELAY_KEY, JSON.stringify(relay));
      setRepurposeOpen(false);
      navigate('/content?from=orchestration');
    },
    [navigate],
  );

  /* ─── Keyboard shortcuts ────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (remixOpen || selectedItem || deleteTarget) return;

      switch (e.key.toLowerCase()) {
        case 'r':
          if (selectedCount > 0) {
            e.preventDefault();
            openRemixForSelection();
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectedCount > 0) {
            e.preventDefault();
            setDeleteTarget({ type: 'bulk' });
          }
          break;
        case 'escape':
          if (selectedCount > 0) {
            e.preventDefault();
            clearSelection();
          }
          break;
        case '/':
          e.preventDefault();
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleSelectAll();
          }
          break;
        case '?':
          setShowShortcuts((prev) => !prev);
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    selectedCount,
    openRemixForSelection,
    clearSelection,
    toggleSelectAll,
    remixOpen,
    selectedItem,
    deleteTarget,
  ]);

  /* ─── Status stats ──────────────────────── */
  const statusCounts = useMemo(() => {
    const counts = { draft: 0, ready: 0, published: 0, archived: 0 };
    for (const item of items) {
      if (item.status in counts) counts[item.status as keyof typeof counts]++;
    }
    return counts;
  }, [items]);

  /* ─── Editor view ───────────────────────── */
  if (selectedItem) {
    return (
      <ContentEditor
        item={selectedItem}
        onSave={async (updates) => {
          const updated = await updateItem(selectedItem.id, updates);
          setSelectedItem(updated);
        }}
        onClose={() => {
          setSelectedItem(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="relative min-h-full">
      {/* Page spotlight */}
      <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-accent/[0.03] blur-[120px]" />

      {/* Header */}
      <div className="relative mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-amber-600/10 border border-accent/10">
                <Layers className="h-5 w-5 text-accent" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">
                Content Library
              </h1>
            </div>
            <p className="text-sm text-text-secondary ml-[52px]">
              {totalCount} piece{totalCount !== 1 ? 's' : ''} across {groups.length} platform
              {groups.length !== 1 ? 's' : ''}
              {' · '}
              <button
                type="button"
                onClick={() => setShowShortcuts((p) => !p)}
                className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <Keyboard className="h-3 w-3" /> shortcuts
              </button>
            </p>
          </div>

          {/* Status pills */}
          <div className="hidden md:flex items-center gap-2">
            {(['published', 'ready', 'draft', 'archived'] as const).map((s) => {
              const colors: Record<string, string> = {
                published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                ready: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                draft: 'bg-surface-3 text-text-secondary border-border-subtle',
                archived: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
              };
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-all duration-200
                    ${statusFilter === s ? 'ring-1 ring-offset-1 ring-offset-surface-0 ring-accent/40 scale-105' : 'hover:scale-[1.02]'}
                    ${colors[s]}`}
                >
                  {statusCounts[s]} {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      {showShortcuts && (
        <div className="mb-4 rounded-lg border border-border-subtle bg-surface-2/60 backdrop-blur-sm px-4 py-3 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-primary">Keyboard Shortcuts</span>
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-[11px]">
            {[
              ['R', 'Remix selected'],
              ['Delete', 'Delete selected'],
              ['Esc', 'Clear selection'],
              ['/', 'Focus search'],
              ['Ctrl+A', 'Select all'],
              ['?', 'Toggle shortcuts'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="rounded border border-border-default bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                  {key}
                </kbd>
                <span className="text-text-tertiary">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform coverage bar */}
      <PlatformCoverageBar
        items={items}
        channels={channels}
        onFilterPlatform={(id) => setChannelFilter(channelFilter === id ? '' : id)}
      />

      {/* Toolbar */}
      <div className="relative mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <input
              data-search-input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search content..."
              className="w-full rounded-lg border border-border-default bg-surface-2/60 backdrop-blur-sm pl-9 pr-8 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-tertiary hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Channel filter */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border border-border-default bg-surface-2/60 backdrop-blur-sm px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="">All Platforms</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.icon} {ch.name}
              </option>
            ))}
          </select>

          {/* Import & Repurpose */}
          <button
            type="button"
            onClick={() => setRepurposeOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all duration-200"
          >
            <Import className="h-3.5 w-3.5" />
            Import
          </button>
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-2/60 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-all duration-200"
          >
            {isAllSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {isAllSelected ? 'Deselect' : 'Select all'}
          </button>

          {selectedCount > 0 && (
            <div className="flex items-center gap-2 animate-fade-in">
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent tabular-nums">
                {selectedCount}
              </span>

              <Button
                variant="primary"
                size="sm"
                onClick={openRemixForSelection}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Remix
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget({ type: 'bulk' })}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>

              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors"
                title="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : items.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => {
            const key = group.channelId ?? '__uncategorized__';
            const isCollapsed = collapsedGroups.has(key);
            const groupAllSelected = group.items.every((i) => selectedIds.has(i.id));
            const groupSomeSelected = group.items.some((i) => selectedIds.has(i.id));

            return (
              <section key={key} className="animate-fade-in">
                {/* Group header */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(key)}
                    className="flex items-center gap-2 group/header"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-3/60 text-text-tertiary group-hover/header:text-text-primary transition-colors">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    {group.channel ? (
                      <>
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg border border-white/5"
                          style={{ background: `${group.color}15` }}
                        >
                          {group.channel.icon}
                        </span>
                        <span className="font-semibold text-sm text-text-primary">
                          {group.channel.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 border border-border-subtle text-text-tertiary">
                          <FileText className="h-4 w-4" />
                        </span>
                        <span className="font-semibold text-sm text-text-secondary">
                          Uncategorized
                        </span>
                      </>
                    )}
                    <span className="rounded-full bg-surface-3/80 px-2 py-0.5 text-[11px] font-medium text-text-tertiary tabular-nums">
                      {group.items.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleGroupSelect(group)}
                    className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary hover:bg-surface-3/60 transition-colors"
                  >
                    {groupAllSelected ? (
                      <CheckSquare className="h-3 w-3 text-accent" />
                    ) : groupSomeSelected ? (
                      <CheckSquare className="h-3 w-3 text-text-tertiary opacity-50" />
                    ) : (
                      <Square className="h-3 w-3" />
                    )}
                    {groupAllSelected ? 'Deselect' : 'Select'}
                  </button>

                  <div className="flex-1 h-px bg-gradient-to-r from-border-subtle to-transparent" />
                </div>

                {/* Cards */}
                {!isCollapsed && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pl-8">
                    {group.items.map((item, i) => (
                      <ContentCard
                        key={item.id}
                        item={item}
                        channel={group.channel}
                        isSelected={selectedIds.has(item.id)}
                        onToggleSelect={() => toggleSelect(item.id)}
                        onSelect={() => setSelectedItem(item)}
                        onCopy={() => navigator.clipboard.writeText(item.body)}
                        onDelete={() => setDeleteTarget({ type: 'single', id: item.id })}
                        onRemix={() => openRemixForItem(item)}
                        platformColor={group.color}
                        index={i}
                        sourceTitle={
                          item.sourceContentId
                            ? sourceTitleMap.get(item.sourceContentId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-3xl bg-accent/10 blur-xl animate-pulse" />
            <div className="relative rounded-2xl bg-gradient-to-br from-accent/15 to-amber-600/10 border border-accent/10 p-5">
              <Layers className="h-12 w-12 text-accent/70" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">Your library is empty</h3>
          <p className="text-sm text-text-secondary max-w-md mb-1">
            Run an orchestration to generate content across platforms.
          </p>
          <p className="text-xs text-text-tertiary">One idea, twelve assets.</p>
        </div>
      )}

      {/* Delete modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={
          deleteTarget?.type === 'bulk'
            ? `Delete ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`
            : 'Delete content'
        }
        confirmLabel={deleteTarget?.type === 'bulk' ? `Delete ${selectedCount}` : 'Delete'}
        onConfirm={handleConfirmDelete}
        variant="danger"
      >
        <p>
          {deleteTarget?.type === 'bulk'
            ? `Permanently delete ${selectedCount} selected item${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`
            : 'Permanently delete this content? This cannot be undone.'}
        </p>
      </Modal>

      {/* Remix modal */}
      <RemixModal
        isOpen={remixOpen}
        sourceItems={remixSources}
        channels={channels}
        onClose={() => setRemixOpen(false)}
        onQuickRemixComplete={() => {
          setRemixOpen(false);
          clearSelection();
          refresh();
        }}
        onDeepRemix={handleDeepRemix}
      />

      {/* Repurpose modal */}
      <RepurposeModal
        isOpen={repurposeOpen}
        channels={channels}
        onClose={() => setRepurposeOpen(false)}
        onQuickRepurposeComplete={() => {
          setRepurposeOpen(false);
          refresh();
        }}
        onDeepRepurpose={handleDeepRepurpose}
      />
    </div>
  );
}

/* ─── Loading skeleton ────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-6 rounded-md bg-surface-3 shimmer" />
            <div className="h-8 w-8 rounded-lg bg-surface-3 shimmer" />
            <div className="h-4 w-24 rounded bg-surface-3 shimmer" />
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pl-8">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border-subtle bg-surface-2/40 p-4 h-36 shimmer"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
