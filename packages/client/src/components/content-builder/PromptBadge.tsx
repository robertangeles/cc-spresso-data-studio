import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Theater, Pencil, Trash2 } from 'lucide-react';
import type { Prompt } from '../../hooks/usePrompts';

interface PromptBadgeProps {
  activePromptId: string | null;
  activePromptName: string | null;
  onSelectPrompt: (promptId: string, name: string, body: string) => void;
  onClearPrompt: () => void;
  onCreateNew: () => void;
  prompts: Prompt[];
  loading: boolean;
  onDeletePrompt?: (id: string) => void;
  onEditPrompt?: (prompt: {
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  }) => void;
}

const CATEGORIES = [
  { value: null, label: 'All' },
  { value: 'content', label: 'Content' },
  { value: 'social', label: 'Social' },
  { value: 'email', label: 'Email' },
  { value: 'custom', label: 'Custom' },
];

export function PromptBadge({
  activePromptId,
  activePromptName,
  onSelectPrompt,
  onClearPrompt,
  onCreateNew,
  prompts,
  loading,
  onDeletePrompt,
  onEditPrompt,
}: PromptBadgeProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position dropdown below the button using portal
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [open, updatePosition]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  const filtered = prompts.filter((p) => {
    const matchesCategory =
      !filterCategory || (p.category ?? 'custom').toLowerCase() === filterCategory;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (prompt: (typeof prompts)[0]) => {
    onSelectPrompt(prompt.id, prompt.name, prompt.body ?? '');
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative">
      {activePromptId && activePromptName ? (
        /* Active prompt pill */
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-accent bg-accent/10 rounded-full px-2.5 py-1 hover:bg-accent/20 transition-colors"
        >
          <Theater className="h-3 w-3" />
          <span className="max-w-[120px] truncate">{activePromptName}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClearPrompt();
            }}
            className="ml-0.5 hover:text-text-secondary transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </button>
      ) : (
        /* Ghost prompt button */
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-text-tertiary hover:text-text-secondary rounded-full px-2.5 py-1 hover:bg-surface-2 transition-colors"
        >
          <Theater className="h-3 w-3" />
          <span>Prompts</span>
        </button>
      )}

      {/* Dropdown panel — rendered via portal to escape overflow clipping */}
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-[300px] max-h-[340px] flex flex-col rounded-xl border border-border-subtle bg-surface-1 shadow-xl shadow-black/30 z-50 overflow-hidden"
            style={{ top: dropdownPos.top + 8, left: dropdownPos.left }}
          >
            {/* Search */}
            <div className="px-3 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search prompts..."
                  autoFocus
                  className="w-full bg-surface-3 rounded-lg border border-border-subtle text-sm text-text-primary placeholder:text-text-tertiary pl-8 pr-3 py-1.5 focus:outline-none focus:border-accent/40 transition-colors"
                />
              </div>
            </div>

            {/* Category pills */}
            <div className="flex gap-1 px-3 pb-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setFilterCategory(cat.value)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    filterCategory === cat.value
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Prompt list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
              {loading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse bg-surface-3 rounded-lg h-10" />
                  ))}
                </>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-4">
                  {search ? 'No prompts match.' : 'No prompts yet.'}
                </p>
              ) : (
                filtered.map((prompt) => (
                  <div
                    key={prompt.id}
                    className={`group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-3 transition-colors ${
                      prompt.id === activePromptId ? 'bg-accent/10 border border-accent/20' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(prompt)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-medium text-text-primary truncate">
                        {prompt.name}
                      </p>
                      <span className="inline-flex rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium text-text-tertiary mt-0.5">
                        {prompt.category ?? 'custom'}
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-1">
                      {onEditPrompt && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                            onEditPrompt({
                              id: prompt.id,
                              name: prompt.name,
                              description: prompt.description,
                              body: prompt.body ?? '',
                              category: prompt.category ?? 'custom',
                              defaultModel: prompt.defaultModel,
                            });
                          }}
                          className="shrink-0 rounded-md p-1 text-text-tertiary hover:text-accent transition-all"
                          title="Edit prompt"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {onDeletePrompt && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePrompt(prompt.id);
                          }}
                          className="shrink-0 rounded-md p-1 text-text-tertiary hover:text-status-error transition-all"
                          title="Delete prompt"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Create new */}
            <div className="border-t border-border-subtle px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
              >
                <Plus className="h-3 w-3" />
                Create New Prompt
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
