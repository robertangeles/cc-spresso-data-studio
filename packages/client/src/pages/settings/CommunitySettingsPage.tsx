import { useState, useEffect, useCallback } from 'react';
import {
  Hash,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Loader2,
  ListTodo,
  Save,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { CommunityChannel, BacklogItem } from '@cc/shared';

type TabView = 'general' | 'channels' | 'backlog';

interface ChannelFormData {
  name: string;
  slug: string;
  description: string;
  type: 'text' | 'announcement';
}

interface BacklogFormData {
  title: string;
  description: string;
  category: string;
  status: BacklogItem['status'];
}

export function CommunitySettingsPage() {
  const [tab, setTab] = useState<TabView>('general');
  const [communityEnabled, setCommunityEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Channels state
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelFormData>({
    name: '',
    slug: '',
    description: '',
    type: 'text',
  });
  const [showChannelForm, setShowChannelForm] = useState(false);

  // Backlog state
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [editingBacklog, setEditingBacklog] = useState<string | null>(null);
  const [backlogForm, setBacklogForm] = useState<BacklogFormData>({
    title: '',
    description: '',
    category: '',
    status: 'planned',
  });
  const [showBacklogForm, setShowBacklogForm] = useState(false);

  // ── Fetch settings ─────────────────────────────────────────
  useEffect(() => {
    api
      .get('/admin/settings/community')
      .then(({ data }) => {
        setCommunityEnabled(data.data?.communityEnabled ?? false);
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, []);

  const handleToggleCommunity = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/community', {
        communityEnabled: !communityEnabled,
      });
      setCommunityEnabled(!communityEnabled);
    } catch {
      /* non-blocking */
    } finally {
      setSaving(false);
    }
  };

  // ── Channels CRUD ──────────────────────────────────────────
  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const { data } = await api.get('/admin/community/channels');
      setChannels(data.data ?? []);
    } catch {
      /* non-blocking */
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'channels') fetchChannels();
  }, [tab, fetchChannels]);

  const handleSaveChannel = async () => {
    setSaving(true);
    try {
      if (editingChannel) {
        await api.put(`/admin/community/channels/${editingChannel}`, channelForm);
      } else {
        await api.post('/admin/community/channels', channelForm);
      }
      setShowChannelForm(false);
      setEditingChannel(null);
      setChannelForm({ name: '', slug: '', description: '', type: 'text' });
      fetchChannels();
    } catch {
      /* non-blocking */
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveChannel = async (id: string, archive: boolean) => {
    try {
      await api.put(`/admin/community/channels/${id}`, { isArchived: archive });
      fetchChannels();
    } catch {
      /* non-blocking */
    }
  };

  const openEditChannel = (channel: CommunityChannel) => {
    setEditingChannel(channel.id);
    setChannelForm({
      name: channel.name,
      slug: channel.slug,
      description: channel.description || '',
      type: channel.type,
    });
    setShowChannelForm(true);
  };

  // ── Backlog CRUD ───────────────────────────────────────────
  const fetchBacklog = useCallback(async () => {
    setBacklogLoading(true);
    try {
      const { data } = await api.get('/admin/backlog/items');
      setBacklogItems(data.data ?? []);
    } catch {
      /* non-blocking */
    } finally {
      setBacklogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'backlog') fetchBacklog();
  }, [tab, fetchBacklog]);

  const handleSaveBacklog = async () => {
    setSaving(true);
    try {
      if (editingBacklog) {
        await api.put(`/admin/backlog/items/${editingBacklog}`, backlogForm);
      } else {
        await api.post('/admin/backlog/items', backlogForm);
      }
      setShowBacklogForm(false);
      setEditingBacklog(null);
      setBacklogForm({ title: '', description: '', category: '', status: 'planned' });
      fetchBacklog();
    } catch {
      /* non-blocking */
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveBacklog = async (id: string, archive: boolean) => {
    try {
      await api.put(`/admin/backlog/items/${id}`, { isArchived: archive });
      fetchBacklog();
    } catch {
      /* non-blocking */
    }
  };

  const handleUpdateBacklogStatus = async (id: string, status: BacklogItem['status']) => {
    try {
      await api.put(`/admin/backlog/items/${id}`, { status });
      fetchBacklog();
    } catch {
      /* non-blocking */
    }
  };

  const openEditBacklog = (item: BacklogItem) => {
    setEditingBacklog(item.id);
    setBacklogForm({
      title: item.title,
      description: item.description || '',
      category: item.category || '',
      status: item.status,
    });
    setShowBacklogForm(true);
  };

  // ── Render ─────────────────────────────────────────────────
  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-text-tertiary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 animate-slide-up">
      <div>
        <h1 className="text-xl font-bold text-text-primary">The Brew Settings</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Configure The Brew chat, channels, and backlog
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-subtle">
        {(
          [
            { key: 'general', label: 'General' },
            { key: 'channels', label: 'Channels' },
            { key: 'backlog', label: 'Backlog' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* General tab */}
      {tab === 'general' && (
        <div className="rounded-xl border border-subtle bg-surface-2/50 backdrop-blur-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">The Brew Enabled</h3>
              <p className="text-xs text-text-tertiary mt-0.5">
                Toggle The Brew chat feature for all users
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleCommunity}
              disabled={saving}
              className="flex items-center"
              aria-label={communityEnabled ? 'Disable community' : 'Enable community'}
            >
              {communityEnabled ? (
                <ToggleRight className="h-8 w-8 text-accent" />
              ) : (
                <ToggleLeft className="h-8 w-8 text-text-tertiary" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Channels tab */}
      {tab === 'channels' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Channels</h3>
            <button
              type="button"
              onClick={() => {
                setEditingChannel(null);
                setChannelForm({ name: '', slug: '', description: '', type: 'text' });
                setShowChannelForm(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-xs font-semibold text-surface-0 hover:shadow-glow-accent transition-all duration-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Channel
            </button>
          </div>

          {/* Channel form */}
          {showChannelForm && (
            <div className="rounded-xl border border-focus bg-surface-2/50 backdrop-blur-sm p-4 space-y-3 animate-scale-in">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">
                  {editingChannel ? 'Edit Channel' : 'New Channel'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowChannelForm(false)}
                  className="p-1 rounded hover:bg-surface-3/50 text-text-tertiary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={channelForm.name}
                    onChange={(e) =>
                      setChannelForm({
                        ...channelForm,
                        name: e.target.value,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                      })
                    }
                    className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                    placeholder="general"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Slug</label>
                  <input
                    type="text"
                    value={channelForm.slug}
                    onChange={(e) => setChannelForm({ ...channelForm, slug: e.target.value })}
                    className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                    placeholder="general"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={channelForm.description}
                  onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })}
                  className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="What's this channel about?"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Type</label>
                <select
                  value={channelForm.type}
                  onChange={(e) =>
                    setChannelForm({
                      ...channelForm,
                      type: e.target.value as 'text' | 'announcement',
                    })
                  }
                  className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                >
                  <option value="text">Text</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveChannel}
                  disabled={saving || !channelForm.name.trim() || !channelForm.slug.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2 text-xs font-semibold text-surface-0 hover:shadow-glow-accent transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Channel list */}
          {channelsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 text-text-tertiary animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className={`flex items-center justify-between rounded-lg border bg-surface-2/50 backdrop-blur-sm p-3 transition-all duration-200 ${
                    channel.isArchived
                      ? 'border-subtle opacity-50'
                      : 'border-subtle hover:border-hover'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Hash className="h-4 w-4 text-text-tertiary flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-primary">{channel.name}</span>
                      {channel.description && (
                        <p className="text-xs text-text-tertiary truncate">{channel.description}</p>
                      )}
                    </div>
                    {channel.isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                        Default
                      </span>
                    )}
                    {channel.isArchived && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-tertiary">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditChannel(channel)}
                      className="p-1.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-text-primary transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {channel.isArchived ? (
                      <button
                        type="button"
                        onClick={() => handleArchiveChannel(channel.id, false)}
                        className="p-1.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-emerald-400 transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleArchiveChannel(channel.id, true)}
                        className="p-1.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-red-400 transition-colors"
                        title="Archive"
                        disabled={channel.isDefault}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Backlog tab */}
      {tab === 'backlog' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Backlog Items</h3>
            <button
              type="button"
              onClick={() => {
                setEditingBacklog(null);
                setBacklogForm({ title: '', description: '', category: '', status: 'planned' });
                setShowBacklogForm(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-xs font-semibold text-surface-0 hover:shadow-glow-accent transition-all duration-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </button>
          </div>

          {/* Backlog form */}
          {showBacklogForm && (
            <div className="rounded-xl border border-focus bg-surface-2/50 backdrop-blur-sm p-4 space-y-3 animate-scale-in">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">
                  {editingBacklog ? 'Edit Item' : 'New Item'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowBacklogForm(false)}
                  className="p-1 rounded hover:bg-surface-3/50 text-text-tertiary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Title</label>
                <input
                  type="text"
                  value={backlogForm.title}
                  onChange={(e) => setBacklogForm({ ...backlogForm, title: e.target.value })}
                  className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="Feature title"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Description</label>
                <textarea
                  value={backlogForm.description}
                  onChange={(e) => setBacklogForm({ ...backlogForm, description: e.target.value })}
                  className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
                  rows={3}
                  placeholder="Describe the feature"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Category</label>
                  <input
                    type="text"
                    value={backlogForm.category}
                    onChange={(e) => setBacklogForm({ ...backlogForm, category: e.target.value })}
                    className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                    placeholder="e.g. Content, AI, UI"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Status</label>
                  <select
                    value={backlogForm.status}
                    onChange={(e) =>
                      setBacklogForm({
                        ...backlogForm,
                        status: e.target.value as BacklogItem['status'],
                      })
                    }
                    className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-focus focus:outline-none focus:ring-1 focus:ring-accent/30"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="shipped">Shipped</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveBacklog}
                  disabled={saving || !backlogForm.title.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2 text-xs font-semibold text-surface-0 hover:shadow-glow-accent transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Backlog list */}
          {backlogLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 text-text-tertiary animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {backlogItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg border bg-surface-2/50 backdrop-blur-sm p-3 transition-all duration-200 ${
                    item.isArchived
                      ? 'border-subtle opacity-50'
                      : 'border-subtle hover:border-hover'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ListTodo className="h-4 w-4 text-text-tertiary flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-primary">{item.title}</span>
                      {item.description && (
                        <p className="text-xs text-text-tertiary truncate">{item.description}</p>
                      )}
                    </div>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        handleUpdateBacklogStatus(item.id, e.target.value as BacklogItem['status'])
                      }
                      className="text-[10px] rounded border border-subtle bg-surface-1 px-1.5 py-0.5 text-text-secondary focus:outline-none"
                    >
                      <option value="planned">Planned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="shipped">Shipped</option>
                    </select>
                    {item.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3/50 text-text-secondary">
                        {item.category}
                      </span>
                    )}
                    <span className="text-[10px] text-text-tertiary">Score: {item.score}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditBacklog(item)}
                      className="p-1.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-text-primary transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {item.isArchived ? (
                      <button
                        type="button"
                        onClick={() => handleArchiveBacklog(item.id, false)}
                        className="p-1.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-emerald-400 transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleArchiveBacklog(item.id, true)}
                        className="p-1.5 rounded hover:bg-surface-3/50 text-text-tertiary hover:text-red-400 transition-colors"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {backlogItems.length === 0 && (
                <p className="text-center py-8 text-sm text-text-tertiary">
                  No backlog items yet. Create one to get started.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
