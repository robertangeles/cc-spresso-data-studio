import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../lib/api';

interface Plan {
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
  isLoading: boolean;
}

interface SubscriptionContextValue extends SubscriptionState {
  refreshSubscription: () => Promise<void>;
  getCostForAction: (actionType: string, isPremium?: boolean) => number;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>({
    plan: null,
    subscription: null,
    creditCosts: [],
    isLoading: true,
  });

  const refreshSubscription = useCallback(async () => {
    try {
      const [subRes, plansRes] = await Promise.all([
        api.get('/billing/subscription').catch(() => null),
        api.get('/billing/plans').catch(() => null),
      ]);

      setState((prev) => ({
        ...prev,
        subscription: subRes?.data?.data?.subscription ?? null,
        plan: subRes?.data?.data?.plan ?? null,
        creditCosts: plansRes?.data?.data?.creditCosts ?? [],
        isLoading: false,
      }));
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // Refresh on window focus (catch credits used in other tabs)
  useEffect(() => {
    const onFocus = () => refreshSubscription();
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

  return (
    <SubscriptionContext.Provider value={{ ...state, refreshSubscription, getCostForAction }}>
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
