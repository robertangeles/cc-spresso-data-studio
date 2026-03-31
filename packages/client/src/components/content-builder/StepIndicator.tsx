import { PenTool, Layout, Sparkles, Image, Calendar, Check } from 'lucide-react';
import type { FlowState } from '../../hooks/useContentBuilder';

interface StepIndicatorProps {
  flowState: FlowState;
}

const STEPS = [
  { key: 'WRITING', label: 'Write', minState: 'WRITING', icon: PenTool },
  { key: 'PLATFORMS_SELECTED', label: 'Platforms', minState: 'PLATFORMS_SELECTED', icon: Layout },
  { key: 'ADAPTED', label: 'Adapt', minState: 'ADAPTED', icon: Sparkles },
  { key: 'MEDIA_ADDED', label: 'Media', minState: 'MEDIA_ADDED', icon: Image },
  { key: 'READY', label: 'Schedule', minState: 'READY', icon: Calendar },
] as const;

const STATE_ORDER: FlowState[] = [
  'IDLE',
  'WRITING',
  'PLATFORMS_SELECTED',
  'ADAPTED',
  'MEDIA_ADDED',
  'READY',
];

function stateIndex(state: FlowState): number {
  return STATE_ORDER.indexOf(state);
}

export function StepIndicator({ flowState }: StepIndicatorProps) {
  const currentIndex = stateIndex(flowState);

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const stepIdx = stateIndex(step.minState as FlowState);
        const isCompleted = currentIndex > stepIdx;
        const isActive = currentIndex === stepIdx;
        const isReachable = currentIndex >= stepIdx;
        const isPrevCompleted =
          i > 0 && currentIndex > stateIndex(STEPS[i - 1].minState as FlowState);
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center gap-1">
            {/* Connector line */}
            {i > 0 && (
              <div className="relative h-[2px] w-5 rounded-full bg-surface-3 overflow-hidden">
                {isPrevCompleted && (
                  <div className="absolute inset-0 bg-accent/60 rounded-full animate-step-fill" />
                )}
              </div>
            )}

            {/* Step circle + label */}
            <div className="flex items-center gap-1.5 group">
              <div
                className={`relative flex items-center justify-center h-5 w-5 rounded-full transition-all duration-500 ${
                  isActive
                    ? 'bg-accent text-text-inverse shadow-[0_0_12px_rgba(255,214,10,0.4)] scale-110'
                    : isCompleted
                      ? 'bg-accent/20 text-accent'
                      : 'bg-surface-3 text-text-tertiary/50'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : (
                  <Icon className="h-2.5 w-2.5" />
                )}
              </div>
              <span
                className={`text-[10px] font-heading font-semibold tracking-wide uppercase transition-colors duration-300 ${
                  isActive
                    ? 'text-accent'
                    : isReachable
                      ? 'text-text-secondary'
                      : 'text-text-tertiary/40'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
