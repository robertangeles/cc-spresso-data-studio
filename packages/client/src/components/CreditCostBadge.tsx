import { Zap } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';

interface CreditCostBadgeProps {
  actionType: string;
  isPremium?: boolean;
  className?: string;
}

/**
 * Small badge showing estimated credit cost before expensive actions.
 * Shows premium multiplier if a premium model is selected.
 */
export function CreditCostBadge({
  actionType,
  isPremium = false,
  className = '',
}: CreditCostBadgeProps) {
  const { getCostForAction } = useSubscription();
  const cost = getCostForAction(actionType, isPremium);

  if (cost === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 ${className}`}
      title={`This action uses approximately ${cost} credit${cost !== 1 ? 's' : ''}`}
    >
      <Zap className="h-2.5 w-2.5" />~{cost} credit{cost !== 1 ? 's' : ''}
    </span>
  );
}
