import { Coffee, PenTool, Search, Lightbulb, BarChart } from 'lucide-react';

interface ChatEmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  { icon: PenTool, text: 'Write a blog post about AI governance for enterprise leaders', color: 'bg-blue-500/10 text-blue-400' },
  { icon: Search, text: 'Research the latest trends in content marketing for 2026', color: 'bg-green-500/10 text-green-400' },
  { icon: Lightbulb, text: 'Brainstorm 10 LinkedIn post ideas for a SaaS founder', color: 'bg-amber-500/10 text-amber-400' },
  { icon: BarChart, text: 'Analyze what makes Paul Graham essays so effective', color: 'bg-purple-500/10 text-purple-400' },
];

export function ChatEmptyState({ onSuggestionClick }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-dim border border-accent/20 shadow-glow-accent animate-float">
        <Coffee className="h-8 w-8 text-accent" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-text-primary mb-1">Drop an idea.</h2>
      <p className="text-sm text-text-tertiary mb-8">Walk away with content.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {suggestions.map((s, i) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onSuggestionClick(s.text)}
            className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4 text-left text-sm text-text-secondary transition-all duration-300 ease-spring hover:border-border-hover hover:bg-surface-3 hover:shadow-glow animate-slide-up"
            style={{ animationDelay: `${i * 75}ms`, animationFillMode: 'backwards' }}
          >
            <div className={`shrink-0 rounded-lg p-2 ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <span className="leading-relaxed">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
