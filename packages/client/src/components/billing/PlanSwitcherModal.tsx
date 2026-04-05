import { useState, useEffect, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Gift,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useSubscription } from '../../context/SubscriptionContext';
import { PlanCard, type PlanCardData } from './PlanCard';

type Step = 'compare' | 'preview' | 'confirm';

interface PreviewData {
  isUpgrade: boolean;
  isDowngrade: boolean;
  currentPlan: { name: string; displayName: string; creditsPerMonth: number };
  targetPlan: { name: string; displayName: string; creditsPerMonth: number; priceCents: number };
  creditDelta: number;
  newCreditsRemaining: number;
  proratedAmountDue: number | null;
  currency: string;
  effectiveDate: string;
  effectiveNow: boolean;
}

interface PlanSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Multi-step plan change modal.
 *
 * Flow:
 *   Step 1 (compare)  → Select a target plan from plan cards
 *   Step 2 (preview)  → See credit delta, proration, effective date
 *   Step 3 (confirm)  → Confirm change or accept retention offer
 */
export function PlanSwitcherModal({ isOpen, onClose }: PlanSwitcherModalProps) {
  const { plan: currentPlan, refreshSubscription } = useSubscription();
  const [step, setStep] = useState<Step>('compare');
  const [plans, setPlans] = useState<PlanCardData[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanCardData | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeDone, setChangeDone] = useState(false);

  // Fetch plans on mount
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const { data } = await api.get('/billing/plans');
        if (data.success) {
          setPlans(
            data.data.plans.map((p: Record<string, unknown>) => ({
              id: p.id as string,
              name: p.name as string,
              displayName: p.displayName as string,
              priceCents: p.priceCents as number,
              creditsPerMonth: p.creditsPerMonth as number,
              features: p.features as string[],
              sortOrder: p.sortOrder as number,
            })),
          );
        }
      } catch {
        setError('Failed to load plans.');
      }
    })();
  }, [isOpen]);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setStep('compare');
      setSelectedPlan(null);
      setPreview(null);
      setError(null);
      setChangeDone(false);
    }
  }, [isOpen]);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleSelectPlan = useCallback(async (plan: PlanCardData) => {
    setSelectedPlan(plan);
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.post('/billing/preview-change', { targetPlanId: plan.id });
      if (data.success) {
        setPreview(data.data);
        setStep('preview');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to preview plan change.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirmChange = useCallback(async () => {
    if (!selectedPlan) return;
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/billing/change-plan', {
        targetPlanId: selectedPlan.id,
      });

      if (data.success) {
        setChangeDone(true);
        await refreshSubscription();

        // Dispatch event for UpgradeCelebration to pick up
        if (preview?.isUpgrade) {
          window.dispatchEvent(
            new CustomEvent('plan-upgraded', {
              detail: { planName: selectedPlan.displayName },
            }),
          );
        }
      }
    } catch (err: unknown) {
      const response = (
        err as {
          response?: { status?: number; data?: { error?: string; data?: { portalUrl?: string } } };
        }
      )?.response;
      if (response?.status === 402 && response?.data?.data?.portalUrl) {
        setError('Payment failed. Please update your payment method.');
        window.open(response.data.data.portalUrl, '_blank');
      } else {
        setError(response?.data?.error ?? 'Plan change failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, preview, refreshSubscription]);

  const handleRetentionAccept = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/billing/change-plan', {
        retention: true,
        couponId: 'retention_50_off', // Admin-configured coupon in Stripe
      });

      if (data.success) {
        setChangeDone(true);
        await refreshSubscription();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not apply discount.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [refreshSubscription]);

  if (!isOpen) return null;

  // Filter to paid plans only (no Free in switcher)
  const paidPlans = plans.filter((p) => p.priceCents > 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl mx-4 rounded-2xl border border-border-subtle bg-surface-1 shadow-dark-xl overflow-hidden animate-scale-in">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-amber-500 to-accent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            {step !== 'compare' && !changeDone && (
              <button
                onClick={() => setStep(step === 'confirm' ? 'preview' : 'compare')}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-text-primary">
              {changeDone
                ? preview?.isUpgrade
                  ? 'Welcome to your new plan!'
                  : 'Plan change scheduled'
                : step === 'compare'
                  ? 'Change Plan'
                  : step === 'preview'
                    ? 'Review Changes'
                    : 'Confirm'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-6">
          {/* Step 1: Compare Plans */}
          {step === 'compare' && !changeDone && (
            <div className="grid gap-4 sm:grid-cols-2">
              {paidPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={currentPlan?.name === plan.name}
                  isSelected={selectedPlan?.id === plan.id}
                  loading={loading && selectedPlan?.id === plan.id}
                  ctaLabel={
                    currentPlan?.name === plan.name
                      ? 'Current Plan'
                      : plan.sortOrder > (currentPlan?.sortOrder ?? 0)
                        ? 'Upgrade'
                        : 'Downgrade'
                  }
                  onSelect={handleSelectPlan}
                />
              ))}
            </div>
          )}

          {/* Step 2: Impact Preview */}
          {step === 'preview' && preview && !changeDone && (
            <div className="space-y-5">
              {/* Direction badge */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    preview.isUpgrade
                      ? 'bg-accent-dim shadow-[0_0_12px_rgba(255,214,10,0.15)]'
                      : 'bg-amber-500/10'
                  }`}
                >
                  {preview.isUpgrade ? (
                    <TrendingUp className="h-5 w-5 text-accent" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-amber-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {preview.isUpgrade ? 'Upgrade' : 'Downgrade'} to{' '}
                    {preview.targetPlan.displayName}
                  </p>
                  <p className="text-xs text-text-secondary">
                    from {preview.currentPlan.displayName}
                  </p>
                </div>
              </div>

              {/* Impact details */}
              <div className="rounded-xl border border-white/5 bg-surface-2/50 backdrop-blur-xl divide-y divide-white/5">
                {/* Credit change */}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-text-secondary">Credits per month</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-tertiary line-through">
                      {preview.currentPlan.creditsPerMonth.toLocaleString()}
                    </span>
                    <ArrowRight className="h-3 w-3 text-text-tertiary" />
                    <span
                      className={`text-sm font-semibold ${preview.isUpgrade ? 'text-accent' : 'text-amber-400'}`}
                    >
                      {preview.targetPlan.creditsPerMonth.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Credit delta */}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-text-secondary">
                    {preview.isUpgrade ? 'Immediate credit boost' : 'Credits after change'}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      preview.creditDelta > 0
                        ? 'text-green-400'
                        : preview.creditDelta < 0
                          ? 'text-amber-400'
                          : 'text-text-primary'
                    }`}
                  >
                    {preview.creditDelta > 0 ? '+' : ''}
                    {preview.creditDelta.toLocaleString()} credits
                  </span>
                </div>

                {/* Proration (upgrades only) */}
                {preview.proratedAmountDue !== null && (
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-sm text-text-secondary">Prorated charge today</span>
                    <span className="text-sm font-semibold text-text-primary">
                      ${(preview.proratedAmountDue / 100).toFixed(2)}{' '}
                      {preview.currency.toUpperCase()}
                    </span>
                  </div>
                )}

                {/* New monthly price */}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-text-secondary">New monthly price</span>
                  <span className="text-sm font-semibold text-text-primary">
                    ${(preview.targetPlan.priceCents / 100).toFixed(2)}/mo
                  </span>
                </div>

                {/* Effective date */}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-text-secondary">Takes effect</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {preview.effectiveNow
                      ? 'Immediately'
                      : new Date(preview.effectiveDate).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Retention offer (downgrades only) */}
              {preview.isDowngrade && (
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim shrink-0">
                      <Gift className="h-4 w-4 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary mb-1">
                        Stay on {preview.currentPlan.displayName} for 50% off
                      </p>
                      <p className="text-xs text-text-secondary mb-3">
                        Keep your {preview.currentPlan.creditsPerMonth.toLocaleString()} monthly
                        credits and all premium features at half price for your next billing cycle.
                      </p>
                      <button
                        onClick={handleRetentionAccept}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2 text-sm font-semibold text-black hover:shadow-[0_0_16px_rgba(255,214,10,0.25)] transition-all duration-200 disabled:opacity-50"
                      >
                        {loading ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                        ) : (
                          <Gift className="h-4 w-4" />
                        )}
                        Accept 50% Off
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm button */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setStep('compare')}
                  className="rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-white/10 border border-white/5 transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmChange}
                  disabled={loading}
                  className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                    preview.isUpgrade
                      ? 'bg-gradient-to-r from-accent to-amber-600 text-black hover:shadow-[0_0_16px_rgba(255,214,10,0.25)]'
                      : 'bg-white/10 text-text-primary hover:bg-white/15 border border-white/10'
                  }`}
                >
                  {loading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {preview.isUpgrade ? 'Upgrade Now' : 'Confirm Downgrade'}
                </button>
              </div>
            </div>
          )}

          {/* Success state */}
          {changeDone && (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dim shadow-[0_0_20px_rgba(255,214,10,0.15)]">
                {preview?.isUpgrade ? (
                  <TrendingUp className="h-7 w-7 text-accent" />
                ) : (
                  <TrendingDown className="h-7 w-7 text-amber-400" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {preview?.isUpgrade
                  ? `Welcome to ${selectedPlan?.displayName}!`
                  : `Downgrade to ${selectedPlan?.displayName} scheduled`}
              </h3>
              <p className="text-sm text-text-secondary mb-6">
                {preview?.isUpgrade
                  ? `Your credits have been boosted and new features are now available.`
                  : `Your plan will change on ${preview ? new Date(preview.effectiveDate).toLocaleDateString() : ''}. You'll keep your current plan until then.`}
              </p>
              <button
                onClick={onClose}
                className="rounded-lg bg-gradient-to-r from-accent to-amber-600 px-6 py-2.5 text-sm font-semibold text-black hover:shadow-[0_0_16px_rgba(255,214,10,0.25)] transition-all duration-200"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
