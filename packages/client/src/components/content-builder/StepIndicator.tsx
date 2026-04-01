import type { FlowState } from '../../hooks/useContentBuilder';

interface StepIndicatorProps {
  flowState: FlowState;
}

const STEPS = [
  { key: 'WRITING', label: 'Write', minState: 'WRITING' },
  { key: 'PLATFORMS_SELECTED', label: 'Platforms', minState: 'PLATFORMS_SELECTED' },
  { key: 'ADAPTED', label: 'Adapt', minState: 'ADAPTED' },
  { key: 'MEDIA_ADDED', label: 'Media', minState: 'MEDIA_ADDED' },
  { key: 'READY', label: 'Schedule', minState: 'READY' },
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
        const isCompleted = currentIndex >= stepIdx;
        const isActive =
          currentIndex === stepIdx || (i === STEPS.length - 1 && currentIndex >= stepIdx);
        const isNext = !isCompleted && currentIndex === stepIdx - 1;
        const isPrevCompleted =
          i > 0 && currentIndex >= stateIndex(STEPS[i - 1].minState as FlowState);

        return (
          <div key={step.key} className="flex items-center gap-1">
            {/* Connector line */}
            {i > 0 && (
              <div
                className={`h-[2px] w-4 rounded-full transition-all duration-500 ${
                  isPrevCompleted ? 'bg-accent/60' : isNext ? 'bg-text-tertiary/30' : 'bg-surface-3'
                }`}
              />
            )}

            {/* Step dot + label */}
            <div className="flex items-center gap-1.5">
              {/* Dot with pulse ring for next step */}
              <div className="relative flex items-center justify-center">
                {isNext && (
                  <div
                    className="absolute h-3.5 w-3.5 rounded-full bg-accent/20 animate-ping"
                    style={{ animationDuration: '2s' }}
                  />
                )}
                <div
                  className={`h-2 w-2 rounded-full transition-all duration-500 ${
                    isActive
                      ? 'bg-accent shadow-[0_0_8px_rgba(255,214,10,0.5)] scale-125'
                      : isCompleted
                        ? 'bg-accent shadow-[0_0_4px_rgba(255,214,10,0.25)]'
                        : isNext
                          ? 'bg-accent/40 shadow-[0_0_6px_rgba(255,214,10,0.15)]'
                          : 'bg-surface-3'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-semibold tracking-wide uppercase transition-colors duration-300 ${
                  isActive
                    ? 'text-accent'
                    : isCompleted
                      ? 'text-accent/80'
                      : isNext
                        ? 'text-text-secondary'
                        : 'text-text-tertiary/70'
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
