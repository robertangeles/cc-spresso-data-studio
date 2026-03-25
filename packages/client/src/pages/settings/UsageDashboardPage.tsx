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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
          <h1 className="text-xl font-semibold text-gray-900">Usage & Costs</h1>
          <p className="mt-1 text-sm text-gray-500">AI token consumption and cost tracking</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            icon={<DollarSign className="h-5 w-5 text-brand-600" />}
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
            icon={<Clock className="h-5 w-5 text-gray-500" />}
            label="Avg Duration"
            value={formatDuration(summary.avgDurationMs)}
            subtitle="per request"
          />
        </div>
      )}

      {/* Timeseries Chart */}
      {timeseries.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Daily Cost Trend</h2>
          <div className="flex h-40 items-end gap-1">
            {timeseries.map((day) => {
              const height = Math.max((day.totalCost / maxTimeseriesCost) * 100, 2);
              return (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className="w-full rounded-t bg-brand-400 transition-colors hover:bg-brand-500"
                    style={{ height: `${height}%` }}
                  />
                  <div className="absolute -top-8 hidden rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
                    {day.date}: {formatCost(day.totalCost)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            <span>{timeseries[0]?.date}</span>
            <span>{timeseries[timeseries.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-2 gap-4">
        {/* By Model */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Cost by Model</h2>
          {byModel.length === 0 ? (
            <p className="text-sm text-gray-400">No usage data yet</p>
          ) : (
            <div className="space-y-2">
              {byModel.map((m) => (
                <div key={m.modelId} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">{m.displayName}</span>
                      <span className="text-xs text-gray-400">{m.percentage}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand-400"
                        style={{ width: `${m.percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 text-sm font-semibold text-gray-900">
                    {formatCost(m.totalCost)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Flow */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Cost by Orchestration</h2>
          {byFlow.length === 0 ? (
            <p className="text-sm text-gray-400">No usage data yet</p>
          ) : (
            <div className="space-y-2">
              {byFlow.map((f) => (
                <div key={f.flowId} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{f.flowName}</span>
                    <span className="ml-2 text-xs text-gray-400">{f.requestCount} runs</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatCost(f.totalCost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cost Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-yellow-600" />
            <h2 className="text-sm font-semibold text-yellow-800">Cost Optimization Suggestions</h2>
          </div>
          <div className="space-y-2">
            {suggestions.slice(0, 5).map((s, i) => (
              <div key={i} className="text-sm text-yellow-700">
                <span className="font-medium">{s.flowName}</span> Step {s.stepIndex + 1} uses{' '}
                <span className="font-medium">{s.currentModel}</span> — switch to{' '}
                <span className="font-medium">{s.suggestedModel}</span> for{' '}
                <span className="font-semibold text-green-700">{s.savingsPercent}% savings</span>
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
    </div>
  );
}
