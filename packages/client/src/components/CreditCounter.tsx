import { useSubscription } from '../context/SubscriptionContext';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Compact credit display for the sidebar user profile.
 * Shows a mini progress bar with credit count.
 * Color shifts: green (>50%) → amber (20-50%) → red (<20%).
 */
export function CreditCounter() {
  const { subscription, isLoading } = useSubscription();
  const navigate = useNavigate();

  if (isLoading || !subscription) return null;

  const { creditsRemaining, creditsAllocated } = subscription;
  const pct = creditsAllocated > 0 ? creditsRemaining / creditsAllocated : 0;

  let barColor = 'bg-green-400';
  let textColor = 'text-green-400';
  let glowColor = 'shadow-[0_0_6px_rgba(34,197,94,0.3)]';
  if (pct <= 0.2) {
    barColor = 'bg-red-400';
    textColor = 'text-red-400';
    glowColor = 'shadow-[0_0_6px_rgba(239,68,68,0.3)]';
  } else if (pct <= 0.5) {
    barColor = 'bg-amber-400';
    textColor = 'text-amber-400';
    glowColor = 'shadow-[0_0_6px_rgba(245,158,11,0.3)]';
  }

  return (
    <button
      onClick={() => navigate('/settings/billing')}
      className="mt-1.5 w-full group"
      title={`${creditsRemaining.toLocaleString()} of ${creditsAllocated.toLocaleString()} credits remaining`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${textColor}`}
        >
          <Zap className="h-2.5 w-2.5" />
          Credits
        </span>
        <span className={`text-[9px] font-medium ${textColor}`}>
          {creditsRemaining.toLocaleString()} / {creditsAllocated.toLocaleString()}
        </span>
      </div>
      <div className={`h-1 w-full rounded-full bg-white/5 overflow-hidden ${glowColor}`}>
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.max(pct * 100, 1)}%` }}
        />
      </div>
    </button>
  );
}
