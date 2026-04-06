import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';

export interface Plan {
  id: string;
  name: string;
  displayName: string;
  priceCents: number;
  currency: string;
  creditsPerMonth: number;
  features: string[];
  sortOrder: number;
}

interface CreditCost {
  actionType: string;
  displayName: string;
  baseCost: number;
  premiumMultiplier: string;
}

interface SubscriptionState {
  plan: Plan | null;
  subscription: {
    id: string;
    status: string;
    creditsRemaining: number;
    creditsAllocated: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    canceledAt: string | null;
  } | null;
  creditCosts: CreditCost[];
  allPlans: Plan[];
  isLoading: boolean;
  /** True if current plan is not the highest tier */
  canUpgrade: boolean;
  /** True if current plan is above free tier */
  canDowngrade: boolean;
  /** Pending downgrade info (null if no downgrade scheduled) */
  pendingDowngrade: { planName: string; effectiveDate: string } | null;
  /** Whether the plan switcher modal is open */
  planSwitcherOpen: boolean;
}

interface SubscriptionContextValue extends SubscriptionState {
  refreshSubscription: () => Promise<void>;
  getCostForAction: (actionType: string, isPremium?: boolean) => number;
  openPlanSwitcher: () => void;
  closePlanSwitcher: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>({
    plan: null,
    subscription: null,
    creditCosts: [],
    allPlans: [],
    isLoading: true,
    canUpgrade: false,
    canDowngrade: false,
    pendingDowngrade: null,
    planSwitcherOpen: false,
  });

  const refreshSubscription = useCallback(async () => {
    try {
      // Fast path: DB-only calls — no Stripe API
      const [subRes, plansRes] = await Promise.all([
        api.get('/billing/subscription').catch(() => null),
        api.get('/billing/plans').catch(() => null),
      ]);

      const currentPlan = subRes?.data?.data?.plan ?? null;
      const allPlans: Plan[] = (plansRes?.data?.data?.plans ?? []).map(
        (p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
          displayName: p.displayName as string,
          priceCents: p.priceCents as number,
          currency: (p.currency as string) ?? 'usd',
          creditsPerMonth: p.creditsPerMonth as number,
          features: p.features as string[],
          sortOrder: p.sortOrder as number,
        }),
      );

      const maxSortOrder = allPlans.length > 0 ? Math.max(...allPlans.map((p) => p.sortOrder)) : 0;

      setState((prev) => ({
        ...prev,
        subscription: subRes?.data?.data?.subscription ?? null,
        plan: currentPlan,
        creditCosts: plansRes?.data?.data?.creditCosts ?? [],
        allPlans,
        canUpgrade: currentPlan ? currentPlan.sortOrder < maxSortOrder : false,
        canDowngrade:
          currentPlan && !prev.pendingDowngrade
            ? currentPlan.sortOrder > 0 && currentPlan.priceCents > 0
            : false,
        isLoading: false,
      }));

      // Lazy path: pending schedule check (Stripe API — non-blocking)
      api
        .get('/billing/pending-schedule')
        .then((schedRes) => {
          const pendingDowngrade = schedRes?.data?.data?.pendingDowngrade ?? null;
          setState((prev) => ({
            ...prev,
            pendingDowngrade,
            canDowngrade: pendingDowngrade
              ? false
              : prev.plan
                ? prev.plan.sortOrder > 0 && prev.plan.priceCents > 0
                : false,
          }));
        })
        .catch(() => {
          // Non-critical — leave pendingDowngrade as-is
        });
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    refreshSubscription();
    // Retry after 3s in case auth token wasn't ready on first attempt
    const retryTimer = setTimeout(() => {
      if (!state.subscription) {
        refreshSubscription();
      }
    }, 3000);
    return () => clearTimeout(retryTimer);
  }, [refreshSubscription, state.subscription]);

  // Refresh on window focus (debounced — max once every 5s)
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current > 5000) {
        lastRefreshRef.current = now;
        refreshSubscription();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSubscription]);

  const getCostForAction = useCallback(
    (actionType: string, isPremium = false): number => {
      const cost = state.creditCosts.find((c) => c.actionType === actionType);
      if (!cost) return 0;
      const multiplier = isPremium ? parseFloat(cost.premiumMultiplier) : 1;
      return Math.ceil(cost.baseCost * multiplier);
    },
    [state.creditCosts],
  );

  const openPlanSwitcher = useCallback(() => {
    setState((prev) => ({ ...prev, planSwitcherOpen: true }));
  }, []);

  const closePlanSwitcher = useCallback(() => {
    setState((prev) => ({ ...prev, planSwitcherOpen: false }));
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        ...state,
        refreshSubscription,
        getCostForAction,
        openPlanSwitcher,
        closePlanSwitcher,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return ctx;
}
