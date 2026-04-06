import { useScrollReveal } from './useScrollReveal';

export function CustomizationSection() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  return (
    <section ref={ref} className={`scroll-reveal ${isVisible ? 'visible' : ''} py-24 px-6`}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-primary text-center mb-4">
          Start simple. Gain more control as you go.
        </h2>
        <p className="text-secondary text-center max-w-2xl mx-auto mb-16 leading-relaxed">
          Spresso starts with a guided workflow to help you move from one idea to multiple outputs
          quickly. As your process evolves, you can customize more of the workflow to fit how you
          create.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Guided Mode Card */}
          <div
            className="bg-surface-2/40 backdrop-blur-xl border border-white/5 rounded-2xl p-8
              transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-dark-lg
              animate-fade-in"
            style={{ animationDelay: '100ms' }}
          >
            <h3 className="text-xl font-semibold text-primary mb-2">Guided Mode</h3>
            <p className="text-sm text-secondary mb-8 leading-relaxed">
              Pick channels, paste your idea, get adapted outputs in seconds
            </p>

            {/* Step visual */}
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3].map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl bg-surface-3/60 border border-white/5
                      flex items-center justify-center text-secondary font-semibold text-lg"
                  >
                    {step}
                  </div>
                  {i < 2 && (
                    <svg
                      className="w-5 h-5 text-tertiary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Custom Mode Card */}
          <div
            className="bg-surface-2/50 backdrop-blur-xl border border-accent/10 rounded-2xl p-8
              shadow-[0_0_24px_rgba(255,214,10,0.06)]
              transition-all duration-300 ease-out hover:-translate-y-1
              hover:shadow-[0_0_32px_rgba(255,214,10,0.12)]
              animate-fade-in"
            style={{ animationDelay: '250ms' }}
          >
            <h3 className="text-xl font-semibold text-primary mb-2">Custom Mode</h3>
            <p className="text-sm text-secondary mb-8 leading-relaxed">
              Fine-tune prompts, adjust tone per platform, build your own workflow
            </p>

            {/* Node/settings visual */}
            <div className="flex items-center justify-center">
              <div className="relative w-48 h-12">
                {/* Center node */}
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    w-10 h-10 rounded-lg bg-accent/15 border border-accent/20
                    flex items-center justify-center"
                >
                  <svg
                    className="w-5 h-5 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>

                {/* Left node */}
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2
                    w-8 h-8 rounded-md bg-surface-3/60 border border-white/10"
                />
                {/* Right node */}
                <div
                  className="absolute right-0 top-1/2 -translate-y-1/2
                    w-8 h-8 rounded-md bg-surface-3/60 border border-white/10"
                />

                {/* Connecting lines */}
                <div className="absolute left-8 top-1/2 w-[calc(50%-28px)] h-px bg-white/10" />
                <div className="absolute right-8 top-1/2 w-[calc(50%-28px)] h-px bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
