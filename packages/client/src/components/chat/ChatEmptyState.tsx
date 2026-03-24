import { Coffee, PenTool, Search, Lightbulb, BarChart } from 'lucide-react';

interface ChatEmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  { icon: PenTool, text: 'Write a blog post about AI governance for enterprise leaders', color: 'bg-blue-50 text-blue-600' },
  { icon: Search, text: 'Research the latest trends in content marketing for 2026', color: 'bg-green-50 text-green-600' },
  { icon: Lightbulb, text: 'Brainstorm 10 LinkedIn post ideas for a SaaS founder', color: 'bg-amber-50 text-amber-600' },
  { icon: BarChart, text: 'Analyze what makes Paul Graham essays so effective', color: 'bg-purple-50 text-purple-600' },
];

export function ChatEmptyState({ onSuggestionClick }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-yellow shadow-lg">
        <Coffee className="h-8 w-8 text-brand-700" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Drop an idea.</h2>
      <p className="text-sm text-gray-500 mb-8">Walk away with content.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {suggestions.map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onSuggestionClick(s.text)}
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left text-sm text-gray-700 shadow-sm transition-all hover:shadow-md hover:border-brand-200 hover:bg-brand-50/30"
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
