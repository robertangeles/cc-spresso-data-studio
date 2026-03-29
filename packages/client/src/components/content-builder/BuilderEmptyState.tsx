import { useState } from 'react';
import {
  Rocket,
  Camera,
  Lightbulb,
  Megaphone,
  PenTool,
  Sparkles,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface BuilderEmptyStateProps {
  onStartScratch: () => void;
  onOpenPrompts: () => void;
  onRepurpose: () => void;
  onQuickStart?: (category: string) => void;
  isGenerating?: boolean;
}

const QUICK_START_TEMPLATES = [
  {
    key: 'product-launch',
    icon: Rocket,
    title: 'Product Launch',
    description: 'Announce a new feature, product, or update to your audience.',
    color: 'amber',
    topBar: 'bg-amber-400',
    hoverBorder: 'hover:border-amber-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(251,191,36,0.15)]',
    iconBg: 'bg-amber-400/10',
    iconText: 'text-amber-400',
    iconHoverBg: 'group-hover:bg-amber-400/20',
  },
  {
    key: 'behind-the-scenes',
    icon: Camera,
    title: 'Behind the Scenes',
    description: 'Show the real work behind your product or journey.',
    color: 'purple',
    topBar: 'bg-purple-400',
    hoverBorder: 'hover:border-purple-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(168,85,247,0.15)]',
    iconBg: 'bg-purple-400/10',
    iconText: 'text-purple-400',
    iconHoverBg: 'group-hover:bg-purple-400/20',
  },
  {
    key: 'tips-and-tricks',
    icon: Lightbulb,
    title: 'Tips & Tricks',
    description: 'Share practical advice or lessons learned.',
    color: 'emerald',
    topBar: 'bg-emerald-400',
    hoverBorder: 'hover:border-emerald-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(52,211,153,0.15)]',
    iconBg: 'bg-emerald-400/10',
    iconText: 'text-emerald-400',
    iconHoverBg: 'group-hover:bg-emerald-400/20',
  },
  {
    key: 'announcement',
    icon: Megaphone,
    title: 'Announcement',
    description: 'Share news, milestones, or company updates.',
    color: 'blue',
    topBar: 'bg-blue-400',
    hoverBorder: 'hover:border-blue-400/40',
    hoverGlow: 'hover:shadow-[0_0_24px_rgba(96,165,250,0.15)]',
    iconBg: 'bg-blue-400/10',
    iconText: 'text-blue-400',
    iconHoverBg: 'group-hover:bg-blue-400/20',
  },
];

const MANUAL_ACTIONS = [
  {
    key: 'scratch',
    icon: PenTool,
    label: 'Blank canvas',
    action: 'onStartScratch' as const,
  },
  {
    key: 'prompt',
    icon: Sparkles,
    label: 'Use a prompt',
    action: 'onOpenPrompts' as const,
  },
  {
    key: 'repurpose',
    icon: RefreshCw,
    label: 'Repurpose',
    action: 'onRepurpose' as const,
  },
];

export function BuilderEmptyState({
  onStartScratch,
  onOpenPrompts,
  onRepurpose,
  onQuickStart,
  isGenerating = false,
}: BuilderEmptyStateProps) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const handlers = { onStartScratch, onOpenPrompts, onRepurpose };

  const handleQuickStart = (key: string) => {
    if (isGenerating) return;
    setActiveTemplate(key);
    onQuickStart?.(key);
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      {/* Headline */}
      <h2 className="text-xl font-bold text-text-primary mb-1.5 animate-slide-up">
        What are you creating today?
      </h2>
      <p
        className="text-sm text-text-tertiary font-light mb-8 max-w-md animate-slide-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        Pick a template and AI will generate a draft, or start from scratch.
      </p>

      {/* Quick-start template cards */}
      <div className="grid w-full max-w-2xl gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        {QUICK_START_TEMPLATES.map((tpl, i) => {
          const isActive = activeTemplate === tpl.key && isGenerating;
          return (
            <button
              key={tpl.key}
              type="button"
              onClick={() => handleQuickStart(tpl.key)}
              disabled={isGenerating}
              className={`group relative flex flex-col items-center gap-3 rounded-xl border border-white/5 bg-gradient-to-br from-surface-2/80 to-surface-3/40 backdrop-blur-sm p-5 text-center transition-all duration-200 ease-spring hover:-translate-y-1 ${tpl.hoverBorder} ${tpl.hoverGlow} overflow-hidden animate-slide-up disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              {/* Colored top bar */}
              <div
                className={`absolute top-0 left-0 right-0 h-[3px] ${tpl.topBar} opacity-60 group-hover:opacity-100 transition-opacity`}
              />

              {/* Icon */}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${tpl.iconBg} transition-all duration-200 ${tpl.iconHoverBg} group-hover:scale-110`}
              >
                {isActive ? (
                  <Loader2 className={`h-5 w-5 ${tpl.iconText} animate-spin`} />
                ) : (
                  <tpl.icon className={`h-5 w-5 ${tpl.iconText}`} />
                )}
              </div>

              {/* Text */}
              <div>
                <p className="text-sm font-medium text-text-primary mb-0.5">{tpl.title}</p>
                <p className="text-[11px] text-text-tertiary leading-relaxed">{tpl.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Manual action row */}
      <div className="flex items-center gap-4">
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">or</span>
        {MANUAL_ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={handlers[action.action]}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-accent/[0.05]"
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
