import { useState } from 'react';
import { Building2, Search, Users, Plus } from 'lucide-react';
import type { Client } from '@cc/shared';

interface ClientListProps {
  clients: Client[];
  selectedId: string | null;
  onSelect: (clientId: string) => void;
  onCreateNew: () => void;
}

// Client type extended with projectCount from API
type ClientWithCount = Client & {
  projectCount?: number;
  primaryContactName?: string;
  primaryContactEmail?: string;
};

export function ClientList({ clients, selectedId, onSelect, onCreateNew }: ClientListProps) {
  const [search, setSearch] = useState('');

  const filtered = (clients as ClientWithCount[]).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-surface-2/50 pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:shadow-[0_0_8px_rgba(255,214,10,0.1)] transition-all"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent/10 blur-xl" />
              <div className="relative rounded-2xl bg-surface-2/80 p-4 border border-white/5">
                <Building2 className="h-8 w-8 text-accent/60" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">
                {search ? 'No clients match your search' : 'No clients yet'}
              </p>
              {!search && (
                <p className="text-xs text-text-tertiary mt-1">
                  Create your first client to get started
                </p>
              )}
            </div>
            {!search && (
              <button
                type="button"
                onClick={onCreateNew}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-3 py-1.5 text-xs font-medium text-surface-0 hover:shadow-[0_0_12px_rgba(255,214,10,0.25)] transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                New Client
              </button>
            )}
          </div>
        ) : (
          filtered.map((client, i) => {
            const isSelected = client.id === selectedId;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => onSelect(client.id)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all duration-200 animate-slide-up ${
                  isSelected
                    ? 'border-accent/30 bg-accent/5 shadow-[0_0_12px_rgba(255,214,10,0.08)]'
                    : 'border-border-subtle bg-surface-2/40 hover:border-accent/20 hover:bg-surface-2/60 hover:-translate-y-0.5 hover:shadow-dark-lg'
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold truncate transition-colors ${isSelected ? 'text-accent' : 'text-text-primary'}`}
                    >
                      {client.name}
                    </p>
                    {client.industry && (
                      <span className="mt-1 inline-block rounded-full bg-surface-3/80 border border-white/5 px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
                        {client.industry}
                      </span>
                    )}
                  </div>
                  {(client.projectCount ?? 0) > 0 && (
                    <span className="shrink-0 flex items-center gap-1 text-[10px] text-text-tertiary mt-0.5">
                      <Users className="h-3 w-3" />
                      {client.projectCount} project{client.projectCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {(client.primaryContactName || client.primaryContactEmail) && (
                  <div className="mt-2 text-[11px] text-text-tertiary truncate">
                    {client.primaryContactName && (
                      <span className="font-medium text-text-secondary">
                        {client.primaryContactName}
                      </span>
                    )}
                    {client.primaryContactName && client.primaryContactEmail && ' · '}
                    {client.primaryContactEmail}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
