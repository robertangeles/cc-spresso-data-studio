import { useState } from 'react';
import { Focus, Info } from 'lucide-react';

interface FocusModeToggleProps {
  active: boolean;
  unreadCount?: number;
  onToggle: () => void;
}

export function FocusModeToggle({ active, unreadCount = 0, onToggle }: FocusModeToggleProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className={`relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
          active
            ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_12px_rgba(255,214,10,0.15)]'
            : 'border-border-subtle bg-surface-2/50 text-text-tertiary hover:text-text-secondary hover:border-accent/20'
        }`}
        title={active ? 'Exit Focus Mode (show chat)' : 'Enter Focus Mode (hide chat)'}
      >
        <Focus className={`h-3.5 w-3.5 ${active ? 'text-accent' : ''}`} />
        <span className="hidden sm:inline">{active ? 'Focus On' : 'Focus'}</span>

        {/* Unread pulse — only meaningful when chat hidden */}
        {active && unreadCount > 0 && (
          <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white animate-pulse ring-2 ring-surface-1 ml-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Info balloon trigger */}
      <button
        type="button"
        onMouseEnter={() => setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
        onFocus={() => setShowInfo(true)}
        onBlur={() => setShowInfo(false)}
        className="p-1 rounded text-text-tertiary/60 hover:text-accent transition-colors"
        aria-label="What is Focus Mode?"
      >
        <Info className="h-3 w-3" />
      </button>

      {/* Balloon */}
      {showInfo && (
        <div
          role="tooltip"
          className="absolute top-full right-0 mt-2 z-50 w-64 rounded-xl border border-accent/30 bg-surface-1 shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-glass p-3 animate-scale-in"
        >
          {/* Arrow */}
          <div
            className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-accent/30 bg-surface-1"
            aria-hidden="true"
          />
          <div className="flex items-start gap-2 relative">
            <div className="p-1 rounded-md bg-accent/10 shrink-0 mt-0.5">
              <Focus className="h-3 w-3 text-accent" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-text-primary">Focus Mode</p>
              <p className="text-[11px] leading-relaxed text-text-secondary">
                Temporarily hides the project chat so you can concentrate on the board. Unread
                messages still pulse on the button — click it to bring chat back.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
