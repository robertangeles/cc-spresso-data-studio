import { useState } from 'react';
import { Plus, Search, BookOpen } from 'lucide-react';

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  defaultModel: string | null;
  currentVersion: number;
}

interface PromptLibraryProps {
  prompts: Prompt[];
  loading: boolean;
  category: string | null;
  onCategoryChange: (cat: string | null) => void;
  onSelectPrompt: (promptId: string, body: string) => void;
  onCreateNew: () => void;
}

const CATEGORIES = [
  { value: null, label: 'All' },
  { value: 'content', label: 'Content' },
  { value: 'social', label: 'Social' },
  { value: 'email', label: 'Email' },
  { value: 'custom', label: 'Custom' },
];

export function PromptLibrary({
  prompts,
  loading,
  category,
  onCategoryChange,
  onSelectPrompt,
  onCreateNew,
}: PromptLibraryProps) {
  const [search, setSearch] = useState('');

  const filtered = prompts.filter((p) => {
    const matchesCategory = !category || p.category.toLowerCase() === category;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-text-primary">Prompts</h2>
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-3 hover:text-text-secondary transition-colors"
          title="Create new prompt"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts..."
            className="w-full bg-surface-3 rounded-md border border-border-subtle text-sm text-text-primary placeholder:text-text-tertiary pl-8 pr-3 py-1.5 focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-4 pb-3 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => onCategoryChange(cat.value)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              category === cat.value
                ? 'bg-accent-dim text-accent'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Prompt list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5 scrollbar-thin">
        {loading ? (
          // Skeleton cards
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-surface-3 rounded-lg h-20" />
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BookOpen className="h-8 w-8 text-text-tertiary mb-2" />
            <p className="text-sm text-text-tertiary">
              {search ? 'No prompts match your search.' : 'No prompts yet. Create one to get started.'}
            </p>
          </div>
        ) : (
          filtered.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onSelectPrompt(prompt.id, prompt.name)}
              className="w-full text-left bg-surface-2 rounded-lg p-3 cursor-pointer hover:bg-surface-3 border border-transparent hover:border-border-default transition-all"
            >
              <p className="text-sm font-medium text-text-primary truncate">{prompt.name}</p>
              {prompt.description && (
                <p className="text-xs text-text-tertiary line-clamp-2 mt-0.5">{prompt.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
                  {prompt.category}
                </span>
                <span className="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
                  v{prompt.currentVersion}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
