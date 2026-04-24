import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clipboard, CornerDownLeft, Pencil, Repeat2, ShieldCheck, Trash2 } from 'lucide-react';
import type { Relationship } from '@cc/shared';
import { escapeClipboardCell } from '../../lib/csvSafe';

/**
 * Step 6 — D-R3 right-click menu for a relationship edge.
 *
 * Anchored to the click coordinates (caller supplies `x`, `y` in
 * clientX/clientY). Rendered via `createPortal(document.body)` per L24
 * so absolute / z-indexed ancestors can't clip it.
 *
 * Actions:
 *   - Rename (inline input; commits on Enter / blur)
 *   - Flip direction (swaps source + target)
 *   - Toggle identifying
 *   - Copy cardinality (via `escapeClipboardCell` so spreadsheet
 *     consumers don't evaluate the value as a formula — CSV-injection
 *     hardening per alignment §7)
 *   - Delete
 *
 * Closes on outside-click or ESC.
 */

export interface EdgeContextMenuProps {
  relationship: Relationship;
  x: number;
  y: number;
  onClose: () => void;
  onRename: (name: string | null) => Promise<void>;
  onFlip: () => Promise<void>;
  onToggleIdentifying: () => Promise<void>;
  onDelete: () => Promise<void>;
  /** Clear all user-placed waypoints so the edge returns to React
   *  Flow's default smooth-step auto-routing. Mirrors Erwin's
   *  "Reset Relationship Paths" command (no bends, no handle
   *  overrides). Disabled / hidden when there are no waypoints. */
  onResetPath: () => Promise<void>;
  /** True when the rel has any persisted waypoints — drives whether
   *  "Reset path" is shown at all. */
  hasWaypoints: boolean;
}

export function EdgeContextMenu(props: EdgeContextMenuProps) {
  return createPortal(<MenuBody {...props} />, document.body);
}

function MenuBody({
  relationship,
  x,
  y,
  onClose,
  onRename,
  onFlip,
  onToggleIdentifying,
  onDelete,
  onResetPath,
  hasWaypoints,
}: EdgeContextMenuProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(relationship.name ?? '');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when we enter rename mode.
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  // Close on outside-click + ESC.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp to viewport so the menu never opens off-screen.
  const width = 220;
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 0) - width - 8);
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 0) - 240);

  const commitRename = async () => {
    const next = nameDraft.trim() || null;
    setRenaming(false);
    if ((next ?? null) === (relationship.name ?? null)) return;
    await onRename(next);
    onClose();
  };

  const copyCardinality = async () => {
    const raw = `${relationship.sourceCardinality}:${relationship.targetCardinality}`;
    const safe = escapeClipboardCell(raw);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(safe);
      }
    } finally {
      onClose();
    }
  };

  return (
    <div
      ref={rootRef}
      data-testid="edge-context-menu"
      role="menu"
      style={{ position: 'fixed', left, top, width }}
      className="z-[60] overflow-hidden rounded-xl border border-white/10 bg-surface-2/95 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
    >
      {renaming ? (
        <div className="px-3 py-2">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-secondary/80">
            Name
          </label>
          <input
            ref={inputRef}
            data-testid="edge-context-rename-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setRenaming(false);
                setNameDraft(relationship.name ?? '');
              }
            }}
            placeholder="e.g. owns, belongs_to_customer"
            autoComplete="off"
            className="w-full rounded-md border border-white/10 bg-surface-1/60 px-2 py-1 font-mono text-xs text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
        </div>
      ) : (
        <ul className="py-1 text-sm">
          <MenuItem
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Rename"
            testId="edge-context-rename"
            onClick={() => setRenaming(true)}
          />
          <MenuItem
            icon={<Repeat2 className="h-3.5 w-3.5" />}
            label="Flip direction"
            testId="edge-context-flip"
            onClick={async () => {
              await onFlip();
              onClose();
            }}
          />
          <MenuItem
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label={relationship.isIdentifying ? 'Make non-identifying' : 'Make identifying'}
            testId="edge-context-toggle-identifying"
            onClick={async () => {
              await onToggleIdentifying();
              onClose();
            }}
          />
          <MenuItem
            icon={<Clipboard className="h-3.5 w-3.5" />}
            label={`Copy ${relationship.sourceCardinality}:${relationship.targetCardinality}`}
            testId="edge-context-copy-cardinality"
            onClick={() => void copyCardinality()}
          />
          {hasWaypoints && (
            <MenuItem
              icon={<CornerDownLeft className="h-3.5 w-3.5" />}
              label="Reset path"
              testId="edge-context-reset-path"
              onClick={async () => {
                await onResetPath();
                onClose();
              }}
            />
          )}
          <li className="my-1 border-t border-white/5" aria-hidden />
          <MenuItem
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete relationship"
            testId="edge-context-delete"
            danger
            onClick={async () => {
              await onDelete();
              onClose();
            }}
          />
        </ul>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  testId,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  testId: string;
  onClick: () => void | Promise<void>;
  danger?: boolean;
}) {
  return (
    <li role="none">
      <button
        role="menuitem"
        type="button"
        data-testid={testId}
        onClick={() => void onClick()}
        className={[
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
          danger
            ? 'text-red-200 hover:bg-red-500/10 hover:text-red-100'
            : 'text-text-secondary hover:bg-accent/[0.08] hover:text-accent hover:shadow-[inset_0_0_12px_rgba(255,214,10,0.08)]',
        ].join(' ')}
      >
        <span className={danger ? 'text-red-300' : 'text-text-secondary'}>{icon}</span>
        {label}
      </button>
    </li>
  );
}
