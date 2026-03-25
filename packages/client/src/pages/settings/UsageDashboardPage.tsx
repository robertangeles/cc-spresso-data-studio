import { useState } from 'react';
import { RefreshCw, TrendingDown, DollarSign, Zap, Clock, BarChart3 } from 'lucide-react';
import { useUsage } from '../../hooks/useUsage';

function formatCost(cost: number): string {
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

export default function UsageDashboardPage() {
  const [dateRange] = useState<{ from?: string; to?: string }>({});
  const { summary, byModel, byFlow, timeseries, suggestions, isLoading, error, refresh } = useUsage(dateRange.from, dateRange.to);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const maxTimeseriesCost = Math.max(...timeseries.map((t) => t.totalCost), 0.01);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Usage & Costs</h1>
          <p className="mt-1 text-sm text-text-secondary">AI token consumption and cost tracking</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-3 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            icon={<DollarSign className="h-5 w-5 text-accent" />}
            label="Total Cost"
            value={formatCost(summary.totalCost)}
            subtitle={`${formatTokens(summary.totalInputTokens + summary.totalOutputTokens)} tokens`}
          />
          <SummaryCard
            icon={<Zap className="h-5 w-5 text-yellow-500" />}
            label="Input Tokens"
            value={formatTokens(summary.totalInputTokens)}
            subtitle="prompts & context"
          />
          <SummaryCard
            icon={<BarChart3 className="h-5 w-5 text-blue-500" />}
            label="Requests"
            value={summary.requestCount.toString()}
            subtitle="AI calls"
          />
          <SummaryCard
            icon={<Clock className="h-5 w-5 text-text-secondary" />}
            label="Avg Duration"
            value={formatDuration(summary.avgDurationMs)}
            subtitle="per request"
          />
        </div>
      )}

      {/* Timeseries Chart */}
      {timeseries.length > 0 && (
        <div className="rounded-lg border border-border-default bg-surface-2 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Daily Cost Trend</h2>
          <div className="flex h-40 items-end gap-1">
            {timeseries.map((day) => {
              const height = Math.max((day.totalCost / maxTimeseriesCost) * 100, 2);
              return (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className="w-full rounded-t bg-brand-400 transition-colors hover:bg-brand-500"
                    style={{ height: `${height}%` }}
                  />
                  <div className="absolute -top-8 hidden rounded bg-surface-4 px-2 py-1 text-xs text-text-primary group-hover:block">
                    {day.date}: {formatCost(day.totalCost)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-text-tertiary">
            <span>{timeseries[0]?.date}</span>
            <span>{timeseries[timeseries.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-2 gap-4">
        {/* By Model */}
        <div className="rounded-lg border border-border-default bg-surface-2 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Cost by Model</h2>
          {byModel.length === 0 ? (
            <p className="text-sm text-text-tertiary">No usage data yet</p>
          ) : (
            <div className="space-y-2">
              {byModel.map((m) => (
                <div key={m.modelId} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">{m.displayName}</span>
                      <span className="text-xs text-text-tertiary">{m.percentage}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-brand-400"
                        style={{ width: `${m.percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 text-sm font-semibold text-text-primary">
                    {formatCost(m.totalCost)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Flow */}
        <div className="rounded-lg border border-border-default bg-surface-2 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Cost by Orchestration</h2>
          {byFlow.length === 0 ? (
            <p className="text-sm text-text-tertiary">No usage data yet</p>
          ) : (
            <div className="space-y-2">
              {byFlow.map((f) => (
                <div key={f.flowId} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-text-primary">{f.flowName}</span>
                    <span className="ml-2 text-xs text-text-tertiary">{f.requestCount} runs</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{formatCost(f.totalCost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cost Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-yellow-400" />
            <h2 className="text-sm font-semibold text-yellow-400">Cost Optimization Suggestions</h2>
          </div>
          <div className="space-y-2">
            {suggestions.slice(0, 5).map((s, i) => (
              <div key={i} className="text-sm text-yellow-300/80">
                <span className="font-medium">{s.flowName}</span> Step {s.stepIndex + 1} uses{' '}
                <span className="font-medium">{s.currentModel}</span> — switch to{' '}
                <span className="font-medium">{s.suggestedModel}</span> for{' '}
                <span className="font-semibold text-green-400">{s.savingsPercent}% savings</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-2 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>
    </div>
  );
}
