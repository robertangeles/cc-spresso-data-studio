import { X, Check } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';

const withoutItems = [
  'Draft in one tool',
  'Rewrite for every platform',
  'Manage prompts manually',
  'Copy-paste between tools',
  'Lose time in adaptation',
];

const withItems = [
  'Start from one idea',
  'Generate adapted outputs',
  'Work from one guided flow',
  'Reduce repetitive content labor',
  'Move faster with more control',
];

export function ComparisonSection() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  return (
    <section ref={ref} className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,214,10,0.03)_0%,transparent_60%)]" />

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* Heading */}
        <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight text-text-primary leading-tight">
            More than <span className="text-gradient-amber">AI writing</span>
          </h2>
        </div>

        {/* Subheading */}
        <div
          className={`mt-5 text-center scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '100ms' }}
        >
          <p className="text-text-secondary font-heading text-lg leading-relaxed max-w-2xl mx-auto">
            Chat tools can help you draft. But turning one idea into platform-ready posts still
            means more prompts, more rewrites, more formatting, and more manual work. Spresso is
            built to handle that workflow in one place.
          </p>
        </div>

        {/* Comparison cards */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {/* Without Spresso */}
          <div
            className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
            style={{ transitionDelay: '200ms' }}
          >
            <div className="group h-full rounded-2xl bg-surface-2/40 backdrop-blur-xl border border-white/5 p-6 md:p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-dark-lg">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-surface-3/80 border border-white/5 flex items-center justify-center">
                  <X className="w-4 h-4 text-red-400/70" />
                </div>
                <h3 className="font-heading text-base font-semibold text-text-tertiary">
                  Without Spresso
                </h3>
              </div>

              {/* Items */}
              <ul className="space-y-4">
                {withoutItems.map((item, i) => (
                  <li
                    key={item}
                    className={`flex items-start gap-3 scroll-reveal ${isVisible ? 'visible' : ''}`}
                    style={{ transitionDelay: `${320 + i * 80}ms` }}
                  >
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-red-500/10 border border-red-400/15 flex items-center justify-center">
                      <X className="w-3 h-3 text-red-400/60" />
                    </span>
                    <span className="text-sm text-text-tertiary font-heading leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* With Spresso */}
          <div
            className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
            style={{ transitionDelay: '260ms' }}
          >
            <div className="group h-full rounded-2xl bg-surface-2/50 backdrop-blur-xl border border-accent/10 p-6 md:p-8 shadow-[0_0_30px_rgba(255,214,10,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(255,214,10,0.12)]">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-amber-600/10 border border-accent/20 flex items-center justify-center shadow-[0_0_8px_rgba(255,214,10,0.12)]">
                  <Check className="w-4 h-4 text-accent" />
                </div>
                <h3 className="font-heading text-base font-semibold text-text-primary">
                  With Spresso
                </h3>
              </div>

              {/* Items */}
              <ul className="space-y-4">
                {withItems.map((item, i) => (
                  <li
                    key={item}
                    className={`flex items-start gap-3 scroll-reveal ${isVisible ? 'visible' : ''}`}
                    style={{ transitionDelay: `${380 + i * 80}ms` }}
                  >
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </span>
                    <span className="text-sm text-text-secondary font-heading leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
