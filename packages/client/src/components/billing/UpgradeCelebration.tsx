import { useState, useEffect, useCallback } from 'react';
import { Sparkles, X } from 'lucide-react';

/**
 * Celebration toast that fires when a user upgrades their plan.
 * Listens for the 'plan-upgraded' custom event dispatched by PlanSwitcherModal.
 * Shows a golden glow toast with confetti-like particles via CSS.
 */
export function UpgradeCelebration() {
  const [isVisible, setIsVisible] = useState(false);
  const [planName, setPlanName] = useState('');

  const handleUpgrade = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    setPlanName(detail?.planName ?? 'your new plan');
    setIsVisible(true);

    // Auto-dismiss after 6 seconds
    setTimeout(() => setIsVisible(false), 6000);
  }, []);

  useEffect(() => {
    window.addEventListener('plan-upgraded', handleUpgrade);
    return () => window.removeEventListener('plan-upgraded', handleUpgrade);
  }, [handleUpgrade]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-6 right-6 z-[200] animate-in slide-in-from-top-4 fade-in duration-500">
      <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-surface-1/95 backdrop-blur-xl shadow-[0_0_40px_rgba(255,214,10,0.15)] p-5 max-w-sm">
        {/* Animated gradient shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/5 to-transparent animate-shimmer" />

        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent via-amber-400 to-accent" />

        {/* Close */}
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-3 right-3 p-1 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Content */}
        <div className="relative flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-dim shadow-[0_0_16px_rgba(255,214,10,0.2)] shrink-0">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Welcome to {planName}!</p>
            <p className="text-xs text-text-secondary mt-1">
              Your credits have been boosted and premium features are now unlocked.
            </p>
          </div>
        </div>

        {/* Particle dots for celebration effect */}
        <div className="absolute top-2 left-8 h-1.5 w-1.5 rounded-full bg-accent/60 animate-ping" />
        <div
          className="absolute top-4 right-16 h-1 w-1 rounded-full bg-amber-400/60 animate-ping"
          style={{ animationDelay: '0.3s' }}
        />
        <div
          className="absolute bottom-3 left-20 h-1 w-1 rounded-full bg-accent/40 animate-ping"
          style={{ animationDelay: '0.6s' }}
        />
      </div>
    </div>
  );
}
