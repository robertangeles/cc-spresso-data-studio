import { useState } from 'react';
import {
  Building2,
  Users,
  Plus,
  UserPlus,
  Pencil,
  Check,
  X,
  Trash2,
  ChevronDown,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganisation } from '../hooks/useOrganisation';
import { MemberList } from '../components/organisation/MemberList';
import { InviteLink } from '../components/organisation/InviteLink';
import { JoinOrgModal } from '../components/organisation/JoinOrgModal';
import type { OrgRole } from '@cc/shared';

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 shadow-[0_0_24px_rgba(255,214,10,0.15)] mb-5">
        <Building2 className="h-8 w-8 text-accent" />
      </div>
      <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent mb-2">
        No Organisation Yet
      </h1>
      <p className="text-sm text-text-tertiary text-center max-w-sm mb-8">
        Create a workspace for your team or join an existing one with an invite key.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 w-full max-w-md">
        <button
          type="button"
          onClick={onCreate}
          className="flex flex-col items-center gap-3 rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-5 hover:-translate-y-0.5 hover:shadow-dark-lg hover:border-accent/20 transition-all duration-200 group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 group-hover:shadow-[0_0_12px_rgba(255,214,10,0.2)] transition-all">
            <Plus className="h-5 w-5 text-accent" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Create Organisation</p>
            <p className="text-xs text-text-tertiary mt-0.5">Start a new workspace</p>
          </div>
        </button>

        <button
          type="button"
          onClick={onJoin}
          className="flex flex-col items-center gap-3 rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-5 hover:-translate-y-0.5 hover:shadow-dark-lg hover:border-accent/20 transition-all duration-200 group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 group-hover:shadow-[0_0_12px_rgba(255,214,10,0.2)] transition-all">
            <UserPlus className="h-5 w-5 text-accent" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Join Organisation</p>
            <p className="text-xs text-text-tertiary mt-0.5">Use an invite key</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Create Org Form ──────────────────────────────────────────────────────────

function CreateOrgForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, desc: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(name.trim(), description.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organisation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-6 shadow-dark-lg">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Create Organisation</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Organisation Name <span className="text-status-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Acme Corp"
              disabled={loading}
              autoFocus
              className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Description <span className="text-text-tertiary">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does your team do?"
              rows={3}
              disabled={loading}
              className="w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all disabled:opacity-50 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-status-error/10 border border-status-error/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-status-error shrink-0" />
              <p className="text-xs text-status-error">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2 text-sm font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-surface-3/50 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Inline Edit Field ────────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  placeholder,
  multiline = false,
  textClass = 'text-base font-semibold text-text-primary',
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  textClass?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      disabled: saving,
      autoFocus: true,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (!multiline && e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
      },
      className:
        'w-full rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all disabled:opacity-50',
    };

    return (
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea {...sharedProps} rows={2} className={`${sharedProps.className} resize-none`} />
        ) : (
          <input type="text" {...sharedProps} />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3/50 text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-all"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`group flex items-center gap-1.5 text-left ${textClass} hover:text-accent transition-colors`}
    >
      <span>{value || <span className="text-text-tertiary">{placeholder}</span>}</span>
      <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </button>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteOrgButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete();
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-status-error">Are you sure? This cannot be undone.</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="rounded-lg bg-status-error px-3 py-1 text-xs font-medium text-white hover:bg-status-error/80 transition-all disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg bg-surface-3/50 px-3 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 rounded-lg bg-status-error/10 border border-status-error/20 px-3 py-1.5 text-xs text-status-error hover:bg-status-error/20 transition-all"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete Organisation
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type View = 'org' | 'create';

export function OrganisationPage() {
  const { user } = useAuth();
  const {
    organisations,
    currentOrg,
    orgDetail,
    loading,
    error,
    createOrg,
    updateOrg,
    deleteOrg,
    joinOrg,
    removeMember,
    updateMemberRole,
    regenerateKey,
    switchOrg,
  } = useOrganisation();

  const [view, setView] = useState<View>('org');
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 rounded-xl bg-status-error/10 border border-status-error/20 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-status-error" />
          <p className="text-sm text-status-error">{error}</p>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <CreateOrgForm
          onSubmit={async (name, description) => {
            await createOrg({ name, description: description || undefined });
            setView('org');
          }}
          onCancel={() => setView('org')}
        />
      </div>
    );
  }

  if (organisations.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <EmptyState onCreate={() => setView('create')} onJoin={() => setJoinModalOpen(true)} />
        <JoinOrgModal
          isOpen={joinModalOpen}
          onClose={() => setJoinModalOpen(false)}
          onJoin={joinOrg}
        />
      </div>
    );
  }

  // Find current user's role in org
  const myMembership = orgDetail?.members.find((m) => m.userId === user?.id);
  const myRole: OrgRole = myMembership?.role ?? 'member';
  const canManage = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 shadow-[0_0_12px_rgba(255,214,10,0.15)]">
              <Building2 className="h-6 w-6 text-accent" />
            </div>
            <div>
              {canManage && currentOrg ? (
                <InlineEdit
                  value={currentOrg.name}
                  onSave={(name) => updateOrg({ name })}
                  placeholder="Organisation name"
                  textClass="text-xl font-bold text-text-primary"
                />
              ) : (
                <h1 className="text-xl font-bold text-text-primary">{currentOrg?.name}</h1>
              )}
              <p className="text-xs text-text-tertiary mt-0.5">
                {orgDetail?.members.length ?? 0} member
                {(orgDetail?.members.length ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Org switcher */}
            {organisations.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSwitcherOpen(!switcherOpen)}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-3/50 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all"
                >
                  Switch Org
                  <ChevronDown className="h-3 w-3" />
                </button>
                {switcherOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-border-default bg-surface-2 py-1 shadow-dark-lg backdrop-blur-glass animate-scale-in">
                    {organisations.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => {
                          switchOrg(org.id);
                          setSwitcherOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                          org.id === currentOrg?.id
                            ? 'text-accent bg-accent/5'
                            : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                        }`}
                      >
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{org.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setJoinModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-surface-3/50 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Join Another
            </button>

            <button
              type="button"
              onClick={() => setView('create')}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-xs font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              New Org
            </button>
          </div>
        </div>

        {/* Description */}
        {canManage && currentOrg ? (
          <div className="rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-4">
            <p className="text-xs font-medium text-text-tertiary mb-2">Description</p>
            <InlineEdit
              value={currentOrg.description ?? ''}
              onSave={(description) => updateOrg({ description })}
              placeholder="Add a description…"
              multiline
              textClass="text-sm text-text-secondary"
            />
          </div>
        ) : currentOrg?.description ? (
          <div className="rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-4">
            <p className="text-sm text-text-secondary">{currentOrg.description}</p>
          </div>
        ) : null}

        {/* Invite link */}
        {canManage && currentOrg && (
          <InviteLink
            joinKey={currentOrg.joinKey}
            canManage={canManage}
            onRegenerate={regenerateKey}
          />
        )}

        {/* Members */}
        <div className="rounded-xl bg-surface-1/80 backdrop-blur-sm border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Members</h2>
          </div>
          {orgDetail ? (
            <MemberList
              members={orgDetail.members}
              currentUserId={user?.id ?? ''}
              currentUserRole={myRole}
              onChangeRole={updateMemberRole}
              onRemove={removeMember}
            />
          ) : (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
            </div>
          )}
        </div>

        {/* Danger zone — owner only */}
        {myRole === 'owner' && (
          <div className="rounded-xl bg-surface-1/80 backdrop-blur-sm border border-status-error/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-status-error/70 mb-3">
              Danger Zone
            </p>
            <DeleteOrgButton onDelete={deleteOrg} />
          </div>
        )}
      </div>

      <JoinOrgModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoin={joinOrg}
      />
    </div>
  );
}
