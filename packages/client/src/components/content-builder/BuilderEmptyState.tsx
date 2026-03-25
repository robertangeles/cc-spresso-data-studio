import { PenTool, Sparkles, BookOpen, RefreshCw } from 'lucide-react';

interface BuilderEmptyStateProps {
  onStartScratch: () => void;
  onOpenPrompts: () => void;
  onRepurpose: () => void;
}

const cards = [
  {
    key: 'scratch',
    icon: PenTool,
    title: 'Start from scratch',
    description: 'Open a blank canvas and start typing your idea.',
    action: 'onStartScratch' as const,
    delay: '0ms',
    topBar: 'bg-amber-400',
    hoverBorder: 'hover:border-amber-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(251,191,36,0.15)]',
    hoverBg: 'hover:bg-amber-400/[0.03]',
    iconBg: 'bg-amber-400/10',
    iconText: 'text-amber-400',
    iconHoverBg: 'group-hover:bg-amber-400/20',
    iconHoverScale: 'group-hover:scale-110',
  },
  {
    key: 'prompt',
    icon: Sparkles,
    title: 'Use a prompt',
    description: 'Pick from proven templates in the prompt library.',
    action: 'onOpenPrompts' as const,
    delay: '75ms',
    topBar: 'bg-purple-400',
    hoverBorder: 'hover:border-purple-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(168,85,247,0.15)]',
    hoverBg: 'hover:bg-purple-400/[0.03]',
    iconBg: 'bg-purple-400/10',
    iconText: 'text-purple-400',
    iconHoverBg: 'group-hover:bg-purple-400/20',
    iconHoverScale: 'group-hover:scale-110',
  },
  {
    key: 'repurpose',
    icon: RefreshCw,
    title: 'Repurpose existing',
    description: 'Turn past content into something new.',
    action: 'onRepurpose' as const,
    delay: '150ms',
    topBar: 'bg-emerald-400',
    hoverBorder: 'hover:border-emerald-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(52,211,153,0.15)]',
    hoverBg: 'hover:bg-emerald-400/[0.03]',
    iconBg: 'bg-emerald-400/10',
    iconText: 'text-emerald-400',
    iconHoverBg: 'group-hover:bg-emerald-400/20',
    iconHoverScale: 'group-hover:scale-110',
  },
];

export function BuilderEmptyState({ onStartScratch, onOpenPrompts, onRepurpose }: BuilderEmptyStateProps) {
  const handlers = { onStartScratch, onOpenPrompts, onRepurpose };

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {/* Keyframes for icon animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pageFlip {
          0%, 100% { transform: rotateY(0deg); }
          50% { transform: rotateY(8deg); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>

      {/* Hero icon with radial amber glow */}
      <div className="relative mb-6 animate-scale-in" style={{ animation: 'float 3s ease-in-out infinite' }}>
        <div className="absolute inset-0 h-16 w-16 rounded-2xl bg-amber-400/20 blur-xl" style={{ animation: 'glowPulse 3s ease-in-out infinite' }} />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-dim to-amber-900/20 border border-amber-400/10" style={{ perspective: '400px' }}>
          <BookOpen className="h-8 w-8 text-accent" style={{ animation: 'pageFlip 4s ease-in-out infinite' }} />
        </div>
      </div>

      {/* Headline with gradient text on "content" */}
      <h2 className="text-2xl font-bold text-text-primary mb-2 animate-slide-up">
        Drop an idea. Walk away with{' '}
        <span className="bg-gradient-to-r from-accent via-amber-300 to-amber-500 bg-clip-text text-transparent">content</span>.
      </h2>
      <p className="text-sm text-text-tertiary font-light mb-10 max-w-md animate-slide-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        Select platforms above, then choose how you want to begin.
      </p>

      {/* Quick-start cards — glass morphism */}
      <div className="grid w-full max-w-lg gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={handlers[card.action]}
            className={`group flex flex-col items-center gap-4 rounded-xl border border-white/5 bg-gradient-to-br from-surface-2/80 to-surface-3/40 backdrop-blur-sm p-6 text-center transition-all duration-200 ease-spring hover:-translate-y-1 ${card.hoverBorder} ${card.hoverGlow} ${card.hoverBg} overflow-hidden animate-slide-up relative`}
            style={{ animationDelay: card.delay, animationFillMode: 'both' }}
          >
            {/* Colored top bar indicator */}
            <div className={`absolute top-0 left-0 right-0 h-[3px] ${card.topBar} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${card.iconBg} transition-all duration-200 ${card.iconHoverBg} ${card.iconHoverScale}`}>
              <card.icon className={`h-5 w-5 ${card.iconText} transition-colors duration-200`} />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">{card.title}</p>
              <p className="text-xs text-text-tertiary leading-relaxed">{card.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
