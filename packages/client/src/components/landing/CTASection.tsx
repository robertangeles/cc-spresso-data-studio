import { ArrowRight } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';
import { PulsingGrid } from './PulsingGrid';

interface CTASectionProps {
  onGetStarted?: () => void;
}

export function CTASection({ onGetStarted }: CTASectionProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <PulsingGrid opacity={0.4} centerY={0.5} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,214,10,0.06)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-0 via-transparent to-surface-0" />
      </div>

      <div className="relative z-10 mx-auto max-w-xl px-6">
        {/* Header */}
        <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-4xl md:text-5xl tracking-tight text-text-primary leading-tight">
            Turn your next idea into{' '}
            <span className="text-gradient-amber">platform-ready posts</span>
          </h2>
          <p className="mt-4 text-text-secondary font-heading text-lg">
            Start with one workflow. Upgrade when it becomes part of how you create.
          </p>
        </div>

        {/* CTA button */}
        <div
          className={`mt-10 text-center scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '200ms' }}
        >
          <button
            onClick={onGetStarted}
            className="group inline-flex items-center gap-3 px-8 py-4 text-base font-semibold text-text-inverse bg-gradient-to-r from-accent to-amber-500 rounded-xl hover:from-accent-hover hover:to-amber-400 hover:shadow-glow-strong hover:-translate-y-1 transition-all duration-300"
          >
            Create your first post set
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
}
