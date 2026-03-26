import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, Sparkles, PartyPopper } from 'lucide-react';

interface TourStep {
  target?: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface GuidedTourProps {
  steps: TourStep[];
  storageKey: string;
  onComplete?: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;

export function GuidedTour({ steps, storageKey, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    if (!dismissed) {
      setIsActive(true);
    }
  }, [storageKey]);

  const updateTargetRect = useCallback(() => {
    const step = steps[currentStep];
    if (!step?.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    });
  }, [currentStep, steps]);

  useEffect(() => {
    if (!isActive) return;
    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [isActive, updateTargetRect]);

  const completeTour = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsActive(false);
    onComplete?.();
  }, [storageKey, onComplete]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      completeTour();
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  if (!isActive || steps.length === 0) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isCenterModal = !step.target || !targetRect;

  const getTooltipStyle = (): React.CSSProperties => {
    if (isCenterModal) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const pos = step.position || 'bottom';
    const style: React.CSSProperties = { position: 'fixed' };

    switch (pos) {
      case 'bottom':
        style.top = targetRect!.top + targetRect!.height + TOOLTIP_GAP;
        style.left = targetRect!.left + targetRect!.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'top':
        style.bottom = window.innerHeight - targetRect!.top + TOOLTIP_GAP;
        style.left = targetRect!.left + targetRect!.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'left':
        style.top = targetRect!.top + targetRect!.height / 2;
        style.right = window.innerWidth - targetRect!.left + TOOLTIP_GAP;
        style.transform = 'translateY(-50%)';
        break;
      case 'right':
        style.top = targetRect!.top + targetRect!.height / 2;
        style.left = targetRect!.left + targetRect!.width + TOOLTIP_GAP;
        style.transform = 'translateY(-50%)';
        break;
    }

    return style;
  };

  // Build the overlay background with a radial gradient spotlight
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9998,
    backdropFilter: 'blur(2px)',
  };

  if (!isCenterModal && targetRect) {
    const cx = targetRect.left + targetRect.width / 2;
    const cy = targetRect.top + targetRect.height / 2;
    const rx = targetRect.width / 2 + 4;
    const ry = targetRect.height / 2 + 4;
    overlayStyle.background = `radial-gradient(ellipse ${rx * 2}px ${ry * 2}px at ${cx}px ${cy}px, transparent 60%, rgba(0,0,0,0.5) 100%)`;
  } else {
    overlayStyle.background = 'rgba(0,0,0,0.5)';
  }

  return (
    <>
      {/* Overlay */}
      <div style={overlayStyle} onClick={handleSkip} />

      {/* Spotlight glow ring */}
      {!isCenterModal && targetRect && (
        <div
          style={{
            position: 'fixed',
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            zIndex: 9999,
            borderRadius: '8px',
            boxShadow: '0 0 20px 6px rgba(255, 214, 10, 0.35), inset 0 0 0 2px rgba(255, 214, 10, 0.2)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="animate-scale-in bg-surface-1 rounded-xl border border-accent/30 shadow-dark-lg p-5 max-w-sm"
        style={{
          ...getTooltipStyle(),
          zIndex: 10000,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex items-center gap-2 mb-2">
          {isLastStep ? (
            <PartyPopper className="h-5 w-5 text-accent" />
          ) : (
            <Sparkles className="h-5 w-5 text-accent" />
          )}
          <h3 className="text-base font-semibold text-text-primary">{step.title}</h3>
        </div>

        <p className="text-sm text-text-secondary mt-1">{step.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4">
          {/* Step dots */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === currentStep ? 'bg-accent' : 'bg-border-subtle'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1"
            >
              Skip Tour
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-surface-0 hover:bg-accent/90 transition-colors"
            >
              {isLastStep ? (
                'Get Started!'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-3 w-3" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
