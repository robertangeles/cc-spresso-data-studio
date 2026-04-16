import { useState, useEffect } from 'react';
import { Zap, Check, Sparkles } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';
import axios from 'axios';

interface Plan {
  id: string;
  name: string;
  displayName: string;
  priceCents: number;
  creditsPerMonth: number;
  features: string[];
}

const tierConfig: Record<
  string,
  { icon: React.ReactNode; accent: string; featured: boolean; purpose: string; cta: string }
> = {
  free: {
    icon: <Zap className="h-5 w-5 text-text-secondary" />,
    accent: 'text-text-secondary',
    featured: false,
    purpose: 'Try the workflow',
    cta: 'Try it free',
  },
  creator: {
    icon: <Sparkles className="h-5 w-5 text-accent" />,
    accent: 'text-accent',
    featured: true,
    purpose: 'For regular creators',
    cta: 'Start Creator',
  },
  business: {
    icon: <Zap className="h-5 w-5 text-amber-400" />,
    accent: 'text-amber-400',
    featured: false,
    purpose: 'For content-driven businesses',
    cta: 'Start Business',
  },
};

const defaultConfig = {
  icon: <Zap className="h-5 w-5 text-text-secondary" />,
  accent: 'text-text-secondary',
  featured: false,
  purpose: '',
  cta: 'Get Started',
};

interface PricingSectionProps {
  onGetStarted: (planId?: string) => void;
}

export function PricingSection({ onGetStarted }: PricingSectionProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get('/api/billing/plans');
        if (!cancelled && data.success) {
          setPlans(data.data.plans);
        }
      } catch (err) {
        console.error('[PricingSection] Failed to load plans:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      ref={ref}
      className={`relative py-24 px-6 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,214,10,0.04)_0%,transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-dim border border-accent/20 shadow-glow-accent">
            <Sparkles className="h-6 w-6 text-accent" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Pricing that grows with your workflow
          </h2>
          <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
            Start free and upgrade when Spresso becomes part of your data workflow.
          </p>
        </div>

        {/* Pricing cards */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-8 animate-pulse"
              >
                <div className="h-6 w-24 rounded bg-surface-3/50 mb-4" />
                <div className="h-10 w-32 rounded bg-surface-3/50 mb-6" />
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((j) => (
                    <div key={j} className="h-4 w-full rounded bg-surface-3/50" />
                  ))}
                </div>
                <div className="mt-8 h-11 w-full rounded-xl bg-surface-3/50" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, index) => {
              const config = tierConfig[plan.name] || defaultConfig;
              const price = plan.priceCents / 100;

              return (
                <div
                  key={plan.id}
                  className={`relative group transition-all duration-500 ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
                  }`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Featured glow border for Creator */}
                  {config.featured && (
                    <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-accent/30 via-amber-600/20 to-accent/10 blur-[1px]" />
                  )}

                  <div
                    className={`relative h-full rounded-2xl backdrop-blur-xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
                      config.featured
                        ? 'bg-surface-2/70 border-accent/20 shadow-[0_0_30px_rgba(255,214,10,0.08)]'
                        : 'bg-surface-2/50 border-white/5 hover:shadow-dark-lg'
                    }`}
                  >
                    {/* Tier header */}
                    <div className="flex items-center gap-2 mb-2">
                      {config.icon}
                      <span
                        className={`text-sm font-semibold uppercase tracking-wider ${config.accent}`}
                      >
                        {plan.displayName}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-4xl font-bold text-text-primary">${price}</span>
                      {price > 0 && <span className="text-text-tertiary text-sm">/mo</span>}
                    </div>

                    {/* Plan purpose — primary differentiator */}
                    <p className="text-sm font-medium text-text-secondary mb-6">{config.purpose}</p>

                    {/* Features */}
                    <ul className="space-y-3 mb-4">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            className={`h-4 w-4 mt-0.5 shrink-0 ${config.featured ? 'text-accent' : 'text-emerald-400'}`}
                          />
                          <span className="text-sm text-text-secondary">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Credits — de-emphasized */}
                    <p className="text-xs text-text-tertiary mb-6">
                      {plan.creditsPerMonth.toLocaleString()} credits/month
                    </p>

                    {/* CTA */}
                    <button
                      onClick={() => onGetStarted(plan.name === 'free' ? undefined : plan.id)}
                      className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all duration-200 ${
                        config.featured
                          ? 'bg-gradient-to-r from-accent to-amber-600 text-surface-0 hover:shadow-[0_0_20px_rgba(255,214,10,0.25)] hover:scale-[1.02] active:scale-[0.98]'
                          : plan.name === 'business'
                            ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-surface-0 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:scale-[1.02] active:scale-[0.98]'
                            : 'bg-surface-3/80 text-text-primary hover:bg-surface-3 border border-white/5 hover:border-white/10'
                      }`}
                    >
                      {config.cta}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom note */}
        <p className="mt-8 text-center text-sm text-text-tertiary">
          No credit card required for Free plan. Upgrade or cancel anytime.
        </p>
      </div>
    </section>
  );
}
