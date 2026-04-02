import { useState, useEffect, useCallback } from 'react';
import { Sparkles, X, Zap, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function UpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const { refreshSessionStatus } = useAuth();

  const handleQuotaExceeded = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    setMessage(
      detail?.message ||
        'Free session limit reached. Upgrade your plan to continue using AI features.',
    );
    setIsOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener('session-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('session-quota-exceeded', handleQuotaExceeded);
  }, [handleQuotaExceeded]);

  const handleClose = () => {
    setIsOpen(false);
    refreshSessionStatus();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-border-subtle bg-surface-1 shadow-dark-xl overflow-hidden animate-scale-in">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-amber-500 to-accent" />

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-all"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 pt-8 text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dim shadow-[0_0_20px_rgba(255,214,10,0.15)]">
            <Sparkles className="h-7 w-7 text-accent" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-text-primary mb-2">
            You&apos;ve used all your free sessions
          </h2>

          {/* Message */}
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">{message}</p>

          {/* Benefits */}
          <div className="mb-6 space-y-2.5 text-left">
            {[
              'Unlimited AI-powered content generation',
              'All platform adaptations included',
              'Priority model access',
            ].map((benefit) => (
              <div
                key={benefit}
                className="flex items-center gap-2.5 rounded-lg bg-surface-2/50 px-3 py-2"
              >
                <Zap className="h-4 w-4 text-accent shrink-0" />
                <span className="text-[13px] text-text-secondary">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <a
              href="/settings/admin/roles"
              onClick={handleClose}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-600 px-5 py-3 text-sm font-semibold text-text-inverse hover:shadow-glow-accent transition-all duration-200 ease-spring hover:-translate-y-0.5"
            >
              Upgrade to Paid
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl px-5 py-2.5 text-sm text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
