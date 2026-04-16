import { Check, Loader2, X, Clock } from 'lucide-react';

type PublishStatus = 'pending' | 'processing' | 'published' | 'failed';

interface PublishStatusTimelineProps {
  status: PublishStatus;
  error?: string | null;
  platform?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

const STATUS_STEPS: { key: PublishStatus; label: string }[] = [
  { key: 'pending', label: 'Scheduled' },
  { key: 'processing', label: 'Processing' },
  { key: 'published', label: 'Published' },
];

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Visual timeline showing async publish progress.
 * Designed for TikTok's async model but reusable for any platform.
 *
 * States: Scheduled → Processing (spinner) → Published / Failed
 */
export function PublishStatusTimeline({
  status,
  error,
  platform,
  publishedAt,
  updatedAt,
}: PublishStatusTimelineProps) {
  const isFailed = status === 'failed';
  const currentIdx = isFailed ? 2 : STATUS_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/30 p-3">
      {platform && (
        <p className="text-[10px] text-text-tertiary mb-2 uppercase tracking-wider font-medium">
          {platform} publish status
        </p>
      )}

      <div className="flex items-center gap-1">
        {STATUS_STEPS.map((step, idx) => {
          const isCompleted = !isFailed && idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isProcessing = isCurrent && status === 'processing';
          const isPublished = isCurrent && status === 'published';
          const isFailedStep = isFailed && idx === 2;

          return (
            <div key={step.key} className="flex items-center gap-1 flex-1">
              {/* Step dot/icon */}
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 transition-all duration-300 ${
                  isFailedStep
                    ? 'bg-red-500/20 border border-red-500/40'
                    : isPublished
                      ? 'bg-green-500/20 border border-green-500/40 shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                      : isProcessing
                        ? 'bg-cyan-400/20 border border-cyan-400/40 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                        : isCompleted
                          ? 'bg-green-500/20 border border-green-500/40'
                          : 'bg-surface-3 border border-border-default'
                }`}
              >
                {isFailedStep && <X className="h-3 w-3 text-red-400" strokeWidth={3} />}
                {isPublished && <Check className="h-3 w-3 text-green-400" strokeWidth={3} />}
                {isProcessing && <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />}
                {isCompleted && !isProcessing && (
                  <Check className="h-3 w-3 text-green-400" strokeWidth={3} />
                )}
                {!isCompleted && !isCurrent && !isFailedStep && (
                  <Clock className="h-2.5 w-2.5 text-text-tertiary" />
                )}
              </div>

              {/* Step label */}
              <div className="min-w-0">
                <p
                  className={`text-[10px] font-medium truncate ${
                    isFailedStep
                      ? 'text-red-400'
                      : isPublished
                        ? 'text-green-400'
                        : isProcessing
                          ? 'text-cyan-400'
                          : isCompleted
                            ? 'text-text-secondary'
                            : 'text-text-tertiary'
                  }`}
                >
                  {isFailedStep ? 'Failed' : step.label}
                </p>
                {isPublished && publishedAt && (
                  <p className="text-[9px] text-text-tertiary">{formatTime(publishedAt)}</p>
                )}
                {isProcessing && updatedAt && (
                  <p className="text-[9px] text-text-tertiary">{formatTime(updatedAt)}</p>
                )}
              </div>

              {/* Connector line (not after last) */}
              {idx < STATUS_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-1 ${
                    isCompleted ? 'bg-green-500/40' : 'bg-border-subtle'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {isFailed && error && (
        <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1">
          <p className="text-[10px] text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
