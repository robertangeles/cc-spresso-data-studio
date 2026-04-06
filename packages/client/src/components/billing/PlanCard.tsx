import { Check, Zap, Sparkles } from 'lucide-react';

export interface PlanCardData {
  id: string;
  name: string;
  displayName: string;
  priceCents: number;
  creditsPerMonth: number;
  features: string[];
  sortOrder: number;
}

interface PlanCardProps {
  plan: PlanCardData;
  isCurrent?: boolean;
  isSelected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Label for the CTA button */
  ctaLabel?: string;
  onSelect?: (plan: PlanCardData) => void;
}

const TIER_CONFIG: Record<string, { accent: string; checkColor: string; featured: boolean }> = {
  free: { accent: 'text-text-secondary', checkColor: 'text-emerald-400', featured: false },
  creator: { accent: 'text-accent', checkColor: 'text-accent', featured: true },
  business: { accent: 'text-amber-400', checkColor: 'text-amber-400', featured: false },
};

function TierIcon({ tier }: { tier: string }) {
  if (tier === 'creator') return <Sparkles className="h-5 w-5 text-accent" />;
  if (tier === 'business') return <Zap className="h-5 w-5 text-amber-400" />;
  return <Zap className="h-5 w-5 text-text-secondary" />;
}

/**
 * Shared plan comparison card.
 * Used by PricingPage (public) and PlanSwitcherModal (in-app).
 */
export function PlanCard({
  plan,
  isCurrent = false,
  isSelected = false,
  disabled = false,
  loading = false,
  ctaLabel,
  onSelect,
}: PlanCardProps) {
  const config = TIER_CONFIG[plan.name] ?? TIER_CONFIG.free;
  const price = (plan.priceCents / 100).toFixed(0);

  return (
    <div className="relative group">
      {/* Featured glow border for Pro */}
      {config.featured && (
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-accent/30 via-amber-600/20 to-accent/10 blur-[1px]" />
      )}

      {/* Selected state glow */}
      {isSelected && !config.featured && (
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-accent/20 to-accent/5 blur-[1px]" />
      )}

      <div
        className={`relative h-full rounded-2xl backdrop-blur-xl border p-6 transition-all duration-300 ${
          isSelected
            ? 'bg-surface-2/70 border-accent/30 shadow-[0_0_20px_rgba(255,214,10,0.1)]'
            : config.featured
              ? 'bg-surface-2/70 border-accent/20 shadow-[0_0_30px_rgba(255,214,10,0.08)]'
              : 'bg-surface-2/50 border-white/5 hover:shadow-dark-lg'
        } ${!disabled && !isCurrent ? 'hover:-translate-y-1 cursor-pointer' : ''}`}
        onClick={() => !disabled && !isCurrent && onSelect?.(plan)}
      >
        {/* Badges */}
        {isCurrent && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-surface-0">
            Current Plan
          </div>
        )}
        {config.featured && !isCurrent && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent to-amber-600 px-3 py-0.5 text-xs font-semibold text-surface-0">
            Most Popular
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <TierIcon tier={plan.name} />
          <span className={`text-sm font-semibold uppercase tracking-wider ${config.accent}`}>
            {plan.displayName}
          </span>
        </div>

        {/* Price */}
        <div className="mb-1">
          <span className="text-3xl font-bold text-text-primary">${price}</span>
          {plan.priceCents > 0 && <span className="text-text-tertiary text-sm">/mo</span>}
        </div>

        {/* Credits */}
        <p className="text-sm text-text-secondary mb-5">
          {plan.creditsPerMonth.toLocaleString()} credits/month
        </p>

        {/* Features */}
        <ul className="space-y-2.5 mb-6">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check className={`h-4 w-4 mt-0.5 shrink-0 ${config.checkColor}`} />
              <span className="text-sm text-text-secondary">{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        {ctaLabel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(plan);
            }}
            disabled={disabled || isCurrent || loading}
            className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all duration-200 ${
              isCurrent
                ? 'bg-surface-3/50 text-text-tertiary cursor-not-allowed'
                : config.featured
                  ? 'bg-gradient-to-r from-accent to-amber-600 text-surface-0 hover:shadow-[0_0_20px_rgba(255,214,10,0.25)] hover:scale-[1.02] active:scale-[0.98]'
                  : plan.name === 'business'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-surface-0 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-surface-3/80 text-text-primary hover:bg-surface-3 border border-white/5 hover:border-white/10'
            }`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing...
              </span>
            ) : isCurrent ? (
              'Current Plan'
            ) : (
              ctaLabel
            )}
          </button>
        )}
      </div>
    </div>
  );
}
