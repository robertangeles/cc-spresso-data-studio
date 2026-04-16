import { useState } from 'react';
import { Crown, Shield, User, MoreHorizontal, UserMinus, ChevronDown } from 'lucide-react';
import type { OrganisationMember, OrgRole } from '@cc/shared';

interface MemberListProps {
  members: OrganisationMember[];
  currentUserId: string;
  currentUserRole: OrgRole;
  onChangeRole: (userId: string, role: OrgRole) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}

const ROLE_ORDER: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2 };

const ROLE_BADGE: Record<
  OrgRole,
  { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  owner: {
    label: 'Owner',
    classes: 'bg-accent/15 text-accent border border-accent/20',
    Icon: Crown,
  },
  admin: {
    label: 'Admin',
    classes: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    Icon: Shield,
  },
  member: {
    label: 'Member',
    classes: 'bg-surface-3/80 text-text-tertiary border border-border-subtle',
    Icon: User,
  },
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface MemberRowProps {
  member: OrganisationMember;
  isCurrentUser: boolean;
  canManage: boolean;
  isOwner: boolean;
  onChangeRole: (userId: string, role: OrgRole) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}

function MemberRow({
  member,
  isCurrentUser,
  canManage,
  isOwner,
  onChangeRole,
  onRemove,
}: MemberRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const badge = ROLE_BADGE[member.role];
  const canBeManaged = canManage && member.role !== 'owner';

  const handleChangeRole = async (role: OrgRole) => {
    setRoleMenuOpen(false);
    setMenuOpen(false);
    setActionLoading(true);
    try {
      await onChangeRole(member.userId, role);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async () => {
    setMenuOpen(false);
    setActionLoading(true);
    try {
      await onRemove(member.userId);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
        isCurrentUser
          ? 'bg-accent/5 border border-accent/10'
          : 'hover:bg-surface-2/50 border border-transparent'
      } ${actionLoading ? 'opacity-60' : ''}`}
    >
      {/* Avatar */}
      {member.userAvatar ? (
        <img
          src={member.userAvatar}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-dim text-xs font-semibold text-accent">
          {getInitials(member.userName)}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-text-primary">{member.userName}</p>
          {isCurrentUser && (
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] text-text-tertiary">
              You
            </span>
          )}
        </div>
        <p className="truncate text-xs text-text-tertiary">{member.userEmail}</p>
      </div>

      {/* Role badge */}
      <div
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.classes}`}
      >
        <badge.Icon className="h-3 w-3" />
        {badge.label}
      </div>

      {/* Actions menu */}
      {canBeManaged && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(!menuOpen);
              setRoleMenuOpen(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-all"
            disabled={actionLoading}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-border-default bg-surface-2 py-1 shadow-dark-lg backdrop-blur-glass animate-scale-in">
              {/* Change role (owner only) */}
              {isOwner && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" />
                      Change Role
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {roleMenuOpen && (
                    <div className="mx-2 mb-1 rounded-lg border border-border-subtle bg-surface-3/80 overflow-hidden">
                      {(['admin', 'member'] as OrgRole[])
                        .filter((r) => r !== member.role)
                        .map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => handleChangeRole(role)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors capitalize"
                          >
                            {ROLE_BADGE[role].label}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {/* Remove */}
              <button
                type="button"
                onClick={handleRemove}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-status-error hover:bg-status-error/10 transition-colors"
              >
                <UserMinus className="h-3.5 w-3.5" />
                Remove Member
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MemberList({
  members,
  currentUserId,
  currentUserRole,
  onChangeRole,
  onRemove,
}: MemberListProps) {
  const sorted = [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner';

  return (
    <div className="space-y-1">
      {sorted.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          isCurrentUser={member.userId === currentUserId}
          canManage={canManage}
          isOwner={isOwner}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
