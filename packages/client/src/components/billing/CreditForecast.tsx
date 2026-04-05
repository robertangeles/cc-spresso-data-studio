import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../../lib/api';

/**
 * Compact credit forecast widget.
 * Shows "~X days remaining at current rate" below the credit bar.
 * Returns null if no forecast data is available (new users, no usage).
 */
export function CreditForecast() {
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/billing/forecast');
        if (!cancelled && data.success && data.data?.daysRemaining !== null) {
          setDaysRemaining(data.data.daysRemaining);
        }
      } catch {
        // Forecast unavailable — widget stays hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (daysRemaining === null) return null;

  let color = 'text-text-tertiary';
  if (daysRemaining <= 3) color = 'text-red-400';
  else if (daysRemaining <= 7) color = 'text-amber-400';

  return (
    <div className={`flex items-center gap-1 mt-0.5 ${color}`}>
      <Clock className="h-2.5 w-2.5" />
      <span className="text-[9px]">~{daysRemaining}d remaining</span>
    </div>
  );
}
