import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Check, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

interface Plan {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
  tier: 'free' | 'pro' | 'ultra';
}

interface CreditCost {
  action: string;
  credits: number;
}

export function PricingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creditCosts, setCreditCosts] = useState<CreditCost[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await api.get('/billing/plans');
        if (data.success) {
          setPlans(data.data.plans);
          setCreditCosts(data.data.creditCosts);
        }
      } catch {
        // Plans fetch failed — show empty state
      }

      // Check if user is logged in and has a subscription
      try {
        const { data } = await api.get('/billing/subscription');
        if (data.success && data.data?.planId) {
          setCurrentPlanId(data.data.planId);
        }
      } catch {
        // Not logged in or no subscription — that's fine
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  const handleSubscribe = async (plan: Plan) => {
    if (plan.tier === 'free') {
      navigate('/register');
      return;
    }

    setCheckoutLoading(plan.id);
    try {
      const { data } = await api.post('/billing/checkout', { planId: plan.id });
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch {
      // Not logged in — save plan selection and redirect to register
      localStorage.setItem('pendingPlanId', plan.id);
      navigate('/login');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const tierConfig: Record<string, { icon: React.ReactNode; accent: string; featured: boolean }> = {
    free: {
      icon: <Zap className="h-5 w-5 text-text-secondary" />,
      accent: 'text-text-secondary',
      featured: false,
    },
    pro: {
      icon: <Sparkles className="h-5 w-5 text-accent" />,
      accent: 'text-accent',
      featured: true,
    },
    ultra: {
      icon: <Zap className="h-5 w-5 text-amber-400" />,
      accent: 'text-amber-400',
      featured: false,
    },
  };

  return (
    <div className="relative min-h-screen bg-surface-0 overflow-hidden">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,214,10,0.06)_0%,transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,214,10,0.03)_0%,transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-16 text-center animate-slide-up">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-dim border border-accent/20 shadow-glow-accent">
            <Sparkles className="h-6 w-6 text-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
            Start free. Upgrade when you need more power. Every plan includes full access to the
            content engine.
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
              const config = tierConfig[plan.tier] || tierConfig.free;
              const isCurrent = currentPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  className="relative group animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Featured glow border for Pro */}
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
                    {/* Current plan badge */}
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-surface-0">
                        Current Plan
                      </div>
                    )}

                    {/* Popular badge for Pro */}
                    {config.featured && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent to-amber-600 px-3 py-0.5 text-xs font-semibold text-surface-0">
                        Most Popular
                      </div>
                    )}

                    {/* Tier header */}
                    <div className="flex items-center gap-2 mb-2">
                      {config.icon}
                      <span
                        className={`text-sm font-semibold uppercase tracking-wider ${config.accent}`}
                      >
                        {plan.name}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-4xl font-bold text-text-primary">${plan.price}</span>
                      {plan.price > 0 && <span className="text-text-tertiary text-sm">/mo</span>}
                    </div>

                    {/* Credits */}
                    <p className="text-sm text-text-secondary mb-6">
                      {plan.credits.toLocaleString()} credits/month
                    </p>

                    {/* Features */}
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            className={`h-4 w-4 mt-0.5 shrink-0 ${config.featured ? 'text-accent' : 'text-emerald-400'}`}
                          />
                          <span className="text-sm text-text-secondary">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => handleSubscribe(plan)}
                      disabled={isCurrent || checkoutLoading === plan.id}
                      className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all duration-200 ${
                        isCurrent
                          ? 'bg-surface-3/50 text-text-tertiary cursor-not-allowed'
                          : config.featured
                            ? 'bg-gradient-to-r from-accent to-amber-600 text-surface-0 hover:shadow-[0_0_20px_rgba(255,214,10,0.25)] hover:scale-[1.02] active:scale-[0.98]'
                            : plan.tier === 'ultra'
                              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-surface-0 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:scale-[1.02] active:scale-[0.98]'
                              : 'bg-surface-3/80 text-text-primary hover:bg-surface-3 border border-white/5 hover:border-white/10'
                      }`}
                    >
                      {checkoutLoading === plan.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Redirecting...
                        </span>
                      ) : isCurrent ? (
                        'Current Plan'
                      ) : plan.tier === 'free' ? (
                        'Get Started'
                      ) : (
                        'Subscribe'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* How Credits Work */}
        {creditCosts.length > 0 && (
          <div className="mt-24 animate-slide-up" style={{ animationDelay: '400ms' }}>
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-text-primary">How credits work</h2>
              <p className="mt-2 text-text-secondary">
                Every action costs a set number of credits. Use them however you want.
              </p>
            </div>

            <div className="mx-auto max-w-2xl rounded-2xl bg-surface-2/50 backdrop-blur-xl border border-white/5 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Action
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Credits
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {creditCosts.map((cost) => (
                    <tr key={cost.action} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-3.5 text-sm text-text-secondary">{cost.action}</td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                          <Zap className="h-3 w-3" />
                          {cost.credits}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Feature comparison */}
        {plans.length > 0 && (
          <div className="mt-24 animate-slide-up" style={{ animationDelay: '500ms' }}>
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-text-primary">Compare plans</h2>
              <p className="mt-2 text-text-secondary">
                Find the perfect fit for your content workflow.
              </p>
            </div>

            <div className="rounded-2xl bg-surface-2/50 backdrop-blur-xl border border-white/5 overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Feature
                    </th>
                    {plans.map((plan) => (
                      <th
                        key={plan.id}
                        className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider ${
                          plan.tier === 'pro' ? 'text-accent' : 'text-text-tertiary'
                        }`}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-3.5 text-sm text-text-secondary">Monthly credits</td>
                    {plans.map((plan) => (
                      <td
                        key={plan.id}
                        className="px-6 py-3.5 text-center text-sm text-text-primary font-medium"
                      >
                        {plan.credits.toLocaleString()}
                      </td>
                    ))}
                  </tr>
                  <tr className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-3.5 text-sm text-text-secondary">Price</td>
                    {plans.map((plan) => (
                      <td
                        key={plan.id}
                        className="px-6 py-3.5 text-center text-sm text-text-primary font-medium"
                      >
                        {plan.price === 0 ? 'Free' : `$${plan.price}/mo`}
                      </td>
                    ))}
                  </tr>
                  {/* Derive comparison rows from all unique features across plans */}
                  {Array.from(new Set(plans.flatMap((p) => p.features))).map((feature) => (
                    <tr key={feature} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-3.5 text-sm text-text-secondary">{feature}</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="px-6 py-3.5 text-center">
                          {plan.features.includes(feature) ? (
                            <Check className="h-4 w-4 text-emerald-400 mx-auto" />
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
