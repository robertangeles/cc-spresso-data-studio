import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Building2, Database, FolderKanban, Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import type { ModelCreate, OriginDirection } from '@cc/shared';
import { useModels, type DataModelSummary } from '../../hooks/useModels';

/**
 * CreateModelDialog — click "Start blank" or "New model" → this dialog.
 *
 * UX:
 *  - Organisation is always shown (read-only chip if the user has 1 org,
 *    a select if >1). It makes the target container unambiguous.
 *  - Project selector is populated from the user's projects, filtered
 *    to the selected org. Required. If there are no projects in the
 *    org, the dialog shows a friendly "create a project first" state
 *    with a link to the Projects page instead of letting the user
 *    hit the server with a guaranteed-fail submit.
 *  - Name field is trimmed, 1-200 chars.
 *
 * Rendered via React portal (lesson 24).
 */

interface OrgOption {
  id: string;
  name: string;
  slug: string;
}
interface ProjectOption {
  id: string;
  name: string;
  organisationId?: string | null;
}

export function CreateModelDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (model: DataModelSummary) => void;
}) {
  const { create } = useModels();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [originDirection, setOriginDirection] = useState<OriginDirection>('greenfield');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load orgs + projects when the dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [orgsRes, projectsRes] = await Promise.all([
          api.get<{ data: OrgOption[] | { organisations?: OrgOption[] } }>('/organisations'),
          api.get<{ data: ProjectOption[] | { projects?: ProjectOption[] } }>('/projects'),
        ]);
        const orgsPayload = orgsRes.data?.data as
          | OrgOption[]
          | { organisations?: OrgOption[] }
          | undefined;
        const orgsList = Array.isArray(orgsPayload)
          ? orgsPayload
          : (orgsPayload?.organisations ?? []);

        const projPayload = projectsRes.data?.data as
          | ProjectOption[]
          | { projects?: ProjectOption[] }
          | undefined;
        const projList = Array.isArray(projPayload) ? projPayload : (projPayload?.projects ?? []);

        if (cancelled) return;
        setOrgs(orgsList);
        setProjects(projList);
        if (orgsList.length > 0) setSelectedOrgId(orgsList[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load options');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Derive projects available in the currently-selected org.
  const projectsInOrg = useMemo(
    () => projects.filter((p) => !selectedOrgId || p.organisationId === selectedOrgId),
    [projects, selectedOrgId],
  );

  // When org selection or project list changes, reset the project pick
  // to a sensible default (first available, or empty if none).
  useEffect(() => {
    if (projectsInOrg.length > 0) {
      if (!projectsInOrg.find((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(projectsInOrg[0].id);
      }
    } else {
      setSelectedProjectId('');
    }
  }, [projectsInOrg, selectedProjectId]);

  useEffect(() => {
    if (open) setTimeout(() => nameInputRef.current?.focus(), 30);
    else {
      setName('');
      setDescription('');
      setOriginDirection('greenfield');
      setError(null);
    }
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const canSubmit =
    name.trim().length > 0 && !!selectedOrgId && !!selectedProjectId && !submitting && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmedDesc = description.trim();
      // Map origin direction to the layer the canvas should open on:
      // greenfield → top-down (start conceptual), existing_system →
      // bottom-up (start physical, reverse-engineering posture).
      const startingLayer = originDirection === 'existing_system' ? 'physical' : 'conceptual';
      const payload: ModelCreate = {
        name: name.trim(),
        projectId: selectedProjectId,
        activeLayer: startingLayer,
        notation: 'ie',
        originDirection,
        description: trimmedDesc.length > 0 ? trimmedDesc : null,
      };
      const created = await create(payload);
      onCreated(created);
    } catch (e) {
      const anyErr = e as {
        response?: { data?: { error?: string; details?: unknown } };
        message?: string;
      };
      setError(anyErr?.response?.data?.error || anyErr?.message || 'Failed to create model');
    } finally {
      setSubmitting(false);
    }
  };

  const orgObj = orgs.find((o) => o.id === selectedOrgId);
  const noProjects = !loading && orgs.length > 0 && projectsInOrg.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-model-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <form
        onSubmit={handleSubmit}
        className={[
          'relative z-10 w-full max-w-md rounded-2xl p-6',
          'bg-surface-2/80 backdrop-blur-xl border border-white/10',
          'shadow-[0_0_48px_rgba(255,214,10,0.15)]',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => !submitting && onClose()}
          className="absolute top-3 right-3 text-text-secondary/70 hover:text-text-primary transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="relative">
            <div
              className="absolute inset-0 bg-accent/20 blur-xl rounded-full"
              aria-hidden="true"
            />
            <div className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 via-accent/5 to-transparent border border-accent/40 text-accent shadow-[0_0_12px_rgba(255,214,10,0.25)]">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div>
            <h2 id="create-model-title" className="text-base font-semibold text-text-primary">
              Start a new model
            </h2>
            <p className="text-xs text-text-secondary">
              Pick the project this model belongs to. You can switch layers and notation later.
            </p>
          </div>
        </div>

        <FieldLabel icon={<Building2 className="h-3 w-3" />} label="Organisation" />
        {loading ? (
          <StaticChip label="Loading…" />
        ) : orgs.length === 0 ? (
          <ErrorChip label="No organisations found. Join or create one first." />
        ) : (
          <SelectField
            value={selectedOrgId}
            onChange={setSelectedOrgId}
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
          />
        )}

        <div className="mt-4" />
        <FieldLabel icon={<Sparkles className="h-3 w-3" />} label="Starting from" />
        <div className="grid grid-cols-2 gap-2">
          <DirectionCard
            label="Greenfield"
            description="Start conceptual. Define entities first, then move down."
            icon={<Sparkles className="h-3.5 w-3.5" />}
            selected={originDirection === 'greenfield'}
            onClick={() => setOriginDirection('greenfield')}
          />
          <DirectionCard
            label="Existing system"
            description="Start physical. Reverse-engineer first, then build upward."
            icon={<Database className="h-3.5 w-3.5" />}
            selected={originDirection === 'existing_system'}
            onClick={() => setOriginDirection('existing_system')}
          />
        </div>

        <div className="mt-4" />
        <FieldLabel icon={<FolderKanban className="h-3 w-3" />} label="Project" />
        {loading ? (
          <StaticChip label="Loading…" />
        ) : noProjects ? (
          <ErrorChip
            label={`No projects in ${orgObj?.name ?? 'this organisation'} yet. Create one in Projects first.`}
          />
        ) : (
          <SelectField
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            options={projectsInOrg.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}

        <div className="mt-4" />
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-text-secondary/80 mb-1.5">
            Model name
          </span>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="e.g. Customer Domain Model"
            className={[
              'w-full rounded-lg px-3 py-2 text-sm',
              'bg-surface-1/60 border border-white/10 text-text-primary',
              'placeholder:text-text-secondary/40',
              'focus:outline-none focus:border-accent/50 focus:shadow-[0_0_12px_rgba(255,214,10,0.15)]',
              'transition-all',
            ].join(' ')}
            required
          />
        </label>

        <div className="mt-4" />
        <label className="block">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="block text-[11px] uppercase tracking-wider text-text-secondary/80">
              Description{' '}
              <span className="normal-case tracking-normal text-text-secondary/50">(optional)</span>
            </span>
            <span className="text-[10px] text-text-secondary/50 tabular-nums">
              {description.length} / 2,000
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="What does this model capture? Who relies on it? Notes for future-you and anyone else inheriting it."
            className={[
              'w-full rounded-lg px-3 py-2 text-sm resize-y min-h-[84px] max-h-[220px]',
              'bg-surface-1/60 border border-white/10 text-text-primary',
              'placeholder:text-text-secondary/40',
              'focus:outline-none focus:border-accent/50 focus:shadow-[0_0_12px_rgba(255,214,10,0.15)]',
              'transition-all',
            ].join(' ')}
          />
        </label>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <div className="mt-5 flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-1/50 transition-colors disabled:opacity-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold',
              'bg-gradient-to-r from-accent to-amber-600 text-black',
              'shadow-[0_0_12px_rgba(255,214,10,0.25)]',
              'hover:shadow-[0_0_24px_rgba(255,214,10,0.4)]',
              'transition-all disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {submitting ? 'Creating…' : 'Create model'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function FieldLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-secondary/80 mb-1.5">
      {icon}
      {label}
    </span>
  );
}

function StaticChip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-surface-1/40 border border-white/5 text-text-primary">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function ErrorChip({ label }: { label: string }) {
  return (
    <div className="rounded-lg px-3 py-2 text-sm bg-surface-1/40 border border-white/5 text-red-300/80">
      {label}
    </div>
  );
}

function DirectionCard({
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={`direction-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={[
        'group rounded-lg border px-3 py-2.5 text-left transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        selected
          ? 'border-accent/60 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent shadow-[0_0_18px_rgba(255,214,10,0.25)]'
          : 'border-white/10 bg-surface-1/40 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-md',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            'inline-flex h-6 w-6 items-center justify-center rounded-md border',
            selected
              ? 'border-accent/40 bg-accent/15 text-accent'
              : 'border-white/10 bg-surface-2/40 text-text-secondary group-hover:text-text-primary',
          ].join(' ')}
        >
          {icon}
        </span>
        <span
          className={[
            'text-xs font-semibold',
            selected ? 'text-text-primary' : 'text-text-primary/90',
          ].join(' ')}
        >
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-text-secondary">{description}</p>
    </button>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full rounded-lg px-3 py-2 text-sm',
        'bg-surface-1/60 border border-white/10 text-text-primary',
        'focus:outline-none focus:border-accent/50 focus:shadow-[0_0_12px_rgba(255,214,10,0.15)]',
        'transition-all',
      ].join(' ')}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
