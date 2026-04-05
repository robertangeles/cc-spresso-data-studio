import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { StripeSettingsPage } from './StripeSettingsPage';
import {
  CreditCard,
  Zap,
  TrendingUp,
  ExternalLink,
  AlertCircle,
  XCircle,
  Settings2,
} from 'lucide-react';

interface UsageBreakdown {
  actionType: string;
  totalCredits: number;
  count: number;
}

interface UsageHistory {
  date: string;
  action: string;
  amount: number;
  balance: number;
}

interface UsageData {
  breakdown: UsageBreakdown[];
  history: UsageHistory[];
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  canceled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  past_due: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const ACTION_COLORS: Record<string, string> = {
  generation: 'bg-violet-500',
  repurpose: 'bg-blue-500',
  refinement: 'bg-cyan-500',
  analysis: 'bg-emerald-500',
  embedding: 'bg-amber-500',
  chat: 'bg-pink-500',
};

function getBarColor(actionType: string): string {
  return ACTION_COLORS[actionType] ?? 'bg-accent';
}

function getCreditColor(percent: number): string {
  if (percent > 50) return 'text-green-400';
  if (percent > 20) return 'text-amber-400';
  return 'text-red-400';
}

function getStrokeColor(percent: number): string {
  if (percent > 50) return 'stroke-green-400';
  if (percent > 20) return 'stroke-amber-400';
  return 'stroke-red-400';
}

function CircularProgress({ percent }: { percent: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  return (
    <svg width="128" height="128" viewBox="0 0 128 128" className="transform -rotate-90">
      <circle
        cx="64"
        cy="64"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        className="text-white/5"
      />
      <circle
        cx="64"
        cy="64"
        r={radius}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`${getStrokeColor(percent)} transition-all duration-700 ease-out`}
      />
    </svg>
  );
}

type BillingTab = 'overview' | 'stripe';

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { plan, subscription, isLoading: subLoading, refreshSubscription } = useSubscription();

  const [activeTab, setActiveTab] = useState<BillingTab>('overview');
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);
  const isAdmin = user?.role === 'Administrator';

  // Show success banner if just subscribed
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessBanner(true);
      setSearchParams({}, { replace: true });
      refreshSubscription();
    }
  }, [searchParams, setSearchParams, refreshSubscription]);

  // Fetch usage data on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/billing/usage');
        if (!cancelled && res.data?.success) {
          setUsage(res.data.data);
        }
      } catch {
        // usage unavailable
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await api.post('/billing/portal');
      if (res.data?.success && res.data.data?.url) {
        window.open(res.data.data.url, '_blank');
      }
    } catch {
      // portal error
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await api.post('/billing/cancel');
      await refreshSubscription();
      setShowCancelModal(false);
    } catch {
      // cancel error
    } finally {
      setCancelLoading(false);
    }
  };

  const handleUpgrade = () => {
    window.location.href = '/pricing';
  };

  if (subLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  const creditsRemaining = subscription?.creditsRemaining ?? 0;
  const creditsAllocated = subscription?.creditsAllocated ?? 1;
  const creditPercent = Math.round((creditsRemaining / creditsAllocated) * 100);
  const priceDollars = plan ? (plan.priceCents / 100).toFixed(2) : '0.00';
  const status = subscription?.status ?? 'inactive';
  const maxBreakdown = usage?.breakdown?.length
    ? Math.max(...usage.breakdown.map((b) => b.totalCredits))
    : 1;

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      {successBanner && (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 backdrop-blur-xl animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-green-400">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-medium">
              Subscription activated successfully! Your credits are ready to use.
            </span>
          </div>
          <button
            onClick={() => setSuccessBanner(false)}
            className="text-green-400/60 hover:text-green-400 transition-colors"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Billing & Credits</h2>
        <p className="text-sm text-text-secondary">
          Manage your subscription, monitor credit usage, and configure payment settings.
        </p>
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div className="flex gap-1 rounded-lg bg-surface-2/50 backdrop-blur-xl border border-white/5 p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === 'overview'
                ? 'bg-accent-dim text-accent shadow-[0_0_8px_rgba(255,214,10,0.1)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('stripe')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === 'stripe'
                ? 'bg-accent-dim text-accent shadow-[0_0_8px_rgba(255,214,10,0.1)]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Stripe Configuration
          </button>
        </div>
      )}

      {/* Stripe Tab Content */}
      {activeTab === 'stripe' && isAdmin && <StripeSettingsPage />}

      {/* Overview Tab Content */}
      {activeTab !== 'stripe' && (
        <>
          {/* end of tab wrapper — closed at the bottom of overview content */}

          {/* Top Section: Plan Card + Credit Balance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Plan Card */}
            <div className="rounded-xl border border-white/5 bg-surface-2/50 backdrop-blur-xl p-6 hover:-translate-y-0.5 hover:shadow-dark-lg transition-all duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-amber-600 shadow-[0_0_12px_rgba(255,214,10,0.15)]">
                    <CreditCard className="h-5 w-5 text-black" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">
                      {plan?.displayName ?? 'No Plan'}
                    </h3>
                    <span
                      className={`inline-block mt-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-white/5 text-text-secondary border-white/10'}`}
                    >
                      {status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold bg-gradient-to-r from-accent to-amber-600 bg-clip-text text-transparent">
                  ${priceDollars}
                </span>
                <span className="text-text-secondary text-sm ml-1">/ month</span>
              </div>

              <div className="space-y-2 text-sm text-text-secondary">
                <div className="flex justify-between">
                  <span>Credits per month</span>
                  <span className="text-text-primary font-medium">
                    {creditsAllocated.toLocaleString()}
                  </span>
                </div>
                {subscription?.currentPeriodEnd && (
                  <div className="flex justify-between">
                    <span>Renews</span>
                    <span className="text-text-primary font-medium">
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {subscription?.canceledAt && (
                  <div className="flex justify-between">
                    <span className="text-amber-400">Canceled on</span>
                    <span className="text-amber-400 font-medium">
                      {new Date(subscription.canceledAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-white/5">
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-text-primary hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-200 disabled:opacity-50"
                >
                  {portalLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-text-primary border-t-transparent" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Manage Billing
                </button>

                {plan && plan.sortOrder < 3 && (
                  <button
                    onClick={handleUpgrade}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-amber-600 px-4 py-2 text-sm font-semibold text-black hover:shadow-[0_0_16px_rgba(255,214,10,0.25)] transition-all duration-200"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Upgrade
                  </button>
                )}

                {subscription && status === 'active' && !subscription.canceledAt && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Credit Balance */}
            <div className="rounded-xl border border-white/5 bg-surface-2/50 backdrop-blur-xl p-6 flex flex-col items-center justify-center hover:-translate-y-0.5 hover:shadow-dark-lg transition-all duration-300">
              <h3 className="text-sm font-medium text-text-secondary mb-4">Credits Remaining</h3>
              <div className="relative mb-4">
                <CircularProgress percent={creditPercent} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${getCreditColor(creditPercent)}`}>
                    {creditsRemaining.toLocaleString()}
                  </span>
                  <span className="text-xs text-text-secondary">
                    of {creditsAllocated.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className={`text-sm font-medium ${getCreditColor(creditPercent)}`}>
                {creditPercent}% remaining
              </div>
            </div>
          </div>

          {/* Usage Breakdown */}
          <div className="rounded-xl border border-white/5 bg-surface-2/50 backdrop-blur-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-semibold text-text-primary">Usage Breakdown</h3>
            </div>

            {usageLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              </div>
            ) : !usage?.breakdown?.length ? (
              <div className="flex flex-col items-center py-8 text-text-secondary">
                <AlertCircle className="h-8 w-8 mb-2 text-white/10" />
                <p className="text-sm">No usage data yet. Start creating to see your breakdown.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {usage.breakdown.map((item) => {
                  const barPercent = (item.totalCredits / maxBreakdown) * 100;
                  return (
                    <div key={item.actionType}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-text-primary capitalize">
                          {item.actionType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {item.totalCredits.toLocaleString()} credits ({item.count} uses)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getBarColor(item.actionType)} transition-all duration-500`}
                          style={{ width: `${barPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Credit Transaction History */}
          <div className="rounded-xl border border-white/5 bg-surface-2/50 backdrop-blur-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-semibold text-text-primary">Transaction History</h3>
            </div>

            {usageLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              </div>
            ) : !usage?.history?.length ? (
              <div className="flex flex-col items-center py-8 text-text-secondary">
                <AlertCircle className="h-8 w-8 mb-2 text-white/10" />
                <p className="text-sm">No transactions yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-text-secondary">
                      <th className="pb-3 pr-4 text-left font-medium">Date</th>
                      <th className="pb-3 pr-4 text-left font-medium">Action</th>
                      <th className="pb-3 pr-4 text-right font-medium">Amount</th>
                      <th className="pb-3 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {usage.history.map((entry, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-4 text-text-secondary whitespace-nowrap">
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-4 text-text-primary capitalize">
                          {entry.action.replace(/_/g, ' ')}
                        </td>
                        <td
                          className={`py-3 pr-4 text-right font-medium whitespace-nowrap ${
                            entry.amount > 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {entry.amount > 0 ? '+' : ''}
                          {entry.amount.toLocaleString()}
                        </td>
                        <td className="py-3 text-right text-text-secondary">
                          {entry.balance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-white/5 bg-surface-2 backdrop-blur-xl p-6 shadow-dark-lg animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Cancel Subscription?</h3>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Your subscription will remain active until the end of the current billing period.
              After that, you&apos;ll lose access to premium features and unused credits will
              expire.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-text-primary hover:bg-white/10 border border-white/5 transition-all duration-200"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 border border-red-500/20 transition-all duration-200 disabled:opacity-50"
              >
                {cancelLoading && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                )}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
