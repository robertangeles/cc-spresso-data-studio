import { ArrowRight } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';
import { PulsingGrid } from './PulsingGrid';
import { AuthForm } from './AuthForm';

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
        <div className={`text-center mb-10 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-4xl md:text-5xl tracking-tight text-text-primary leading-tight">
            Ready to create once and <span className="text-gradient-amber">reach everywhere?</span>
          </h2>
          <p className="mt-4 text-text-secondary font-heading text-lg">
            Join thousands of creators who stopped juggling tools and started building momentum.
          </p>
        </div>

        {/* Auth card */}
        <div
          className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '200ms' }}
        >
          <div className="relative rounded-2xl p-[1px] overflow-hidden">
            {/* Animated conic gradient border */}
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent, rgba(255,214,10,0.15), transparent, rgba(255,214,10,0.08), transparent)',
                animation: 'spin 8s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { rotate: 360deg; } }`}</style>

            <div className="relative rounded-2xl bg-surface-2/90 backdrop-blur-glass p-6 border border-border-subtle">
              <AuthForm mode="register" />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-text-tertiary">
            No credit card required. Free during Open Beta.
          </p>
        </div>

        {/* Alternative CTA for mobile */}
        <div
          className={`mt-8 text-center lg:hidden scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '400ms' }}
        >
          <button
            onClick={onGetStarted}
            className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-text-inverse bg-gradient-to-r from-accent to-amber-500 rounded-xl hover:shadow-glow-strong transition-all duration-300"
          >
            Get started now
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
}
