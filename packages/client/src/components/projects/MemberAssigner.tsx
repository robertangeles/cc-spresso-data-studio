import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Check, X, Crown, Eye, Pencil, UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useOrganisation } from '../../hooks/useOrganisation';
import { PresenceIndicator } from '../community/PresenceIndicator';
import type { ProjectMember, ProjectMemberRole, OrganisationMember } from '@cc/shared';

interface MemberAssignerProps {
  projectId: string;
  members: ProjectMember[];
  onMembersChange: (members: ProjectMember[]) => void;
}

const ROLE_CONFIG: Record<ProjectMemberRole, { icon: typeof Crown; label: string; color: string }> =
  {
    owner: { icon: Crown, label: 'Owner', color: 'text-amber-400' },
    editor: { icon: Pencil, label: 'Editor', color: 'text-blue-400' },
    viewer: { icon: Eye, label: 'Viewer', color: 'text-slate-400' },
    member: { icon: UserPlus, label: 'Member', color: 'text-emerald-400' },
  };

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function MemberAssigner({ projectId, members, onMembersChange }: MemberAssignerProps) {
  const { orgDetail } = useOrganisation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const orgMembers: OrganisationMember[] = orgDetail?.members ?? [];
  const memberUserIds = new Set(members.map((m) => m.userId));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addMember = useCallback(
    async (userId: string) => {
      setSaving(userId);
      try {
        const { data } = await api.post(`/projects/${projectId}/members`, {
          userId,
          role: 'member',
        });
        onMembersChange([...members, data.data]);
      } catch {
        // Silently fail — the API handles validation
      } finally {
        setSaving(null);
      }
    },
    [projectId, members, onMembersChange],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      setSaving(userId);
      try {
        await api.delete(`/projects/${projectId}/members/${userId}`);
        onMembersChange(members.filter((m) => m.userId !== userId));
      } catch {
        // Silently fail
      } finally {
        setSaving(null);
      }
    },
    [projectId, members, onMembersChange],
  );

  // Max 5 visible avatars, then +N
  const visibleMembers = members.slice(0, 5);
  const overflowCount = members.length - 5;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar stack trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1"
        title="Manage members"
      >
        <div className="flex -space-x-2">
          {visibleMembers.map((m) => (
            <div
              key={m.userId}
              className="h-7 w-7 rounded-full border-2 border-surface-1 bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-secondary overflow-hidden transition-transform group-hover:scale-105"
              title={`${m.userName} (${m.role})`}
            >
              {m.userAvatar ? (
                <img src={m.userAvatar} alt={m.userName} className="h-full w-full object-cover" />
              ) : (
                getInitials(m.userName)
              )}
            </div>
          ))}
          {overflowCount > 0 && (
            <div className="h-7 w-7 rounded-full border-2 border-surface-1 bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
              +{overflowCount}
            </div>
          )}
        </div>
        <div className="ml-1 p-1 rounded-md text-text-tertiary opacity-0 group-hover:opacity-100 hover:bg-surface-3 transition-all">
          <Plus className="h-3.5 w-3.5" />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border-subtle bg-surface-1 shadow-dark-lg backdrop-blur-glass overflow-hidden animate-slide-up">
          <div className="px-3 py-2.5 border-b border-border-subtle">
            <p className="text-xs font-semibold text-text-secondary">
              Project Members ({members.length})
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {orgMembers.length === 0 ? (
              <p className="px-3 py-4 text-xs text-text-tertiary text-center">
                No organisation members found
              </p>
            ) : (
              orgMembers.map((om) => {
                const isAssigned = memberUserIds.has(om.userId);
                const projectMember = members.find((m) => m.userId === om.userId);
                const isSaving = saving === om.userId;
                const roleConf = projectMember
                  ? ROLE_CONFIG[projectMember.role]
                  : ROLE_CONFIG.member;

                return (
                  <div
                    key={om.userId}
                    className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${
                      isAssigned ? 'bg-accent/5' : 'hover:bg-surface-3/60'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center text-[11px] font-bold text-text-secondary overflow-hidden">
                        {om.userAvatar ? (
                          <img
                            src={om.userAvatar}
                            alt={om.userName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          getInitials(om.userName)
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <PresenceIndicator isOnline={false} size="sm" />
                      </div>
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {om.userName}
                      </p>
                      <p className="text-[10px] text-text-tertiary truncate">{om.userEmail}</p>
                    </div>

                    {/* Role badge if assigned */}
                    {isAssigned && (
                      <span
                        className={`text-[10px] font-medium ${roleConf.color} flex items-center gap-0.5`}
                      >
                        <roleConf.icon className="h-2.5 w-2.5" />
                        {roleConf.label}
                      </span>
                    )}

                    {/* Toggle button */}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => (isAssigned ? removeMember(om.userId) : addMember(om.userId))}
                      className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${
                        isAssigned
                          ? 'text-accent hover:text-red-400 hover:bg-red-500/10'
                          : 'text-text-tertiary hover:text-accent hover:bg-accent/10'
                      }`}
                      title={isAssigned ? 'Remove from project' : 'Add to project'}
                    >
                      {isSaving ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      ) : isAssigned ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
