import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { ProjectMember, CardLabel } from '@cc/shared';
import { api } from '../../lib/api';

export interface FilterState {
  query: string;
  priorities: Set<string>;
  assigneeId: string | null;
  labelId: string | null;
}

interface SearchFilterBarProps {
  projectId: string;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', style: 'bg-red-500/15 text-red-400 ring-red-500/30' },
  { value: 'high', label: 'High', style: 'bg-amber-500/15 text-amber-400 ring-amber-500/30' },
  { value: 'medium', label: 'Medium', style: 'bg-blue-500/15 text-blue-400 ring-blue-500/30' },
  { value: 'low', label: 'Low', style: 'bg-slate-500/15 text-slate-400 ring-slate-500/30' },
];

export function SearchFilterBar({ projectId, filters, onChange }: SearchFilterBarProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [labels, setLabels] = useState<CardLabel[]>([]);

  useEffect(() => {
    api
      .get(`/projects/${projectId}/members`)
      .then(({ data }) => setMembers(data.data ?? []))
      .catch(() => {});
    api
      .get(`/projects/${projectId}/labels`)
      .then(({ data }) => setLabels(data.data ?? []))
      .catch(() => {});
  }, [projectId]);

  const togglePriority = (priority: string) => {
    const next = new Set(filters.priorities);
    if (next.has(priority)) next.delete(priority);
    else next.add(priority);
    onChange({ ...filters, priorities: next });
  };

  const hasActiveFilters =
    filters.query || filters.priorities.size > 0 || filters.assigneeId || filters.labelId;

  const clearAll = () => {
    onChange({ query: '', priorities: new Set(), assigneeId: null, labelId: null });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
        <input
          type="text"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Search cards..."
          className="rounded-lg border border-border-subtle bg-surface-2/50 pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all w-48"
        />
        {filters.query && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, query: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Priority chips */}
      <div className="flex items-center gap-1">
        {PRIORITY_OPTIONS.map((opt) => {
          const active = filters.priorities.has(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePriority(opt.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 ${
                active
                  ? `${opt.style} ring-1`
                  : 'bg-surface-3/50 text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Assignee filter */}
      {members.length > 0 && (
        <select
          value={filters.assigneeId ?? ''}
          onChange={(e) => onChange({ ...filters, assigneeId: e.target.value || null })}
          className="rounded-lg border border-border-subtle bg-surface-2/50 px-2.5 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none [color-scheme:dark] transition-all"
        >
          <option value="">All assignees</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userName}
            </option>
          ))}
        </select>
      )}

      {/* Label filter */}
      {labels.length > 0 && (
        <div className="flex items-center gap-1">
          {labels.map((label) => {
            const active = filters.labelId === label.id;
            return (
              <button
                key={label.id}
                type="button"
                onClick={() => onChange({ ...filters, labelId: active ? null : label.id })}
                title={label.name}
                className={`h-5 w-5 rounded-full transition-all hover:scale-110 ${active ? 'ring-2 ring-offset-1 ring-offset-surface-0' : ''}`}
                style={{
                  backgroundColor: label.color,
                  ...(active ? { ringColor: label.color } : {}),
                }}
              />
            );
          })}
        </div>
      )}

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
