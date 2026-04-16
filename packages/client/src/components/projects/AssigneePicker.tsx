import { useState, useEffect, useRef } from 'react';
import { ChevronDown, UserMinus } from 'lucide-react';
import type { ProjectMember } from '@cc/shared';
import { api } from '../../lib/api';

interface AssigneePickerProps {
  projectId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  onAssign: (userId: string | null) => Promise<void>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function Avatar({
  name,
  avatar,
  size = 'sm',
}: {
  name: string;
  avatar: string | null;
  size?: 'sm' | 'xs';
}) {
  const dim = size === 'xs' ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-xs';
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${dim} rounded-full object-cover ring-1 ring-white/10`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-gradient-to-br from-accent/40 to-amber-600/40 flex items-center justify-center font-semibold text-accent ring-1 ring-accent/20`}
    >
      {getInitials(name)}
    </div>
  );
}

export function AssigneePicker({
  projectId,
  assigneeId,
  assigneeName,
  assigneeAvatar,
  onAssign,
}: AssigneePickerProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get(`/projects/${projectId}/members`)
      .then(({ data }) => setMembers(data.data ?? []))
      .catch(() => {});
  }, [projectId]);

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

  const handleSelect = async (userId: string | null) => {
    if (isSaving) return;
    setOpen(false);
    setIsSaving(true);
    try {
      await onAssign(userId);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isSaving}
        className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2 text-sm text-text-primary hover:border-accent/30 focus:border-accent/40 focus:outline-none transition-all w-full disabled:opacity-60"
      >
        {assigneeId && assigneeName ? (
          <>
            <Avatar name={assigneeName} avatar={assigneeAvatar} size="xs" />
            <span className="flex-1 text-left text-sm text-text-primary">{assigneeName}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-sm text-text-tertiary">Unassigned</span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-surface-1/95 backdrop-blur-md shadow-dark-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Unassign option */}
          <button
            type="button"
            onClick={() => void handleSelect(null)}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-text-tertiary hover:bg-surface-3/50 hover:text-text-secondary transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-surface-3/50 flex items-center justify-center border border-white/5">
              <UserMinus className="h-3.5 w-3.5" />
            </div>
            <span>Unassign</span>
          </button>

          {members.length > 0 && (
            <div className="border-t border-border-subtle">
              {members.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => void handleSelect(m.userId)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors ${
                    m.userId === assigneeId
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:bg-surface-3/50 hover:text-text-primary'
                  }`}
                >
                  <Avatar name={m.userName} avatar={m.userAvatar} />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium truncate">{m.userName}</p>
                    <p className="text-[10px] text-text-tertiary truncate">{m.userEmail}</p>
                  </div>
                  {m.userId === assigneeId && (
                    <span className="text-[10px] text-accent font-semibold">Assigned</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {members.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-tertiary">No members in this project.</p>
          )}
        </div>
      )}
    </div>
  );
}
