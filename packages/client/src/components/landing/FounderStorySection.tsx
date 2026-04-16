import { useScrollReveal } from './useScrollReveal';

export function FounderStorySection() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  return (
    <section ref={ref} className={`scroll-reveal ${isVisible ? 'visible' : ''} py-24 px-6`}>
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-primary text-center mb-12">
          Built from a real workflow problem
        </h2>

        <div
          className="relative bg-surface-2/50 backdrop-blur-xl border border-accent/10 rounded-2xl p-10 md:p-14
            shadow-[0_0_32px_rgba(255,214,10,0.06)]
            animate-fade-in"
          style={{ animationDelay: '150ms' }}
        >
          {/* Decorative quotation mark */}
          <span
            className="absolute top-4 left-6 text-[8rem] leading-none font-serif text-accent/20
              pointer-events-none select-none"
            aria-hidden="true"
          >
            &ldquo;
          </span>

          <blockquote className="relative z-10">
            <p className="text-lg md:text-xl text-primary leading-relaxed mb-8 italic">
              I built Spresso after getting frustrated by how much manual effort it took to turn
              source schemas into production-ready dimensional models. Spresso is designed to reduce
              that repetitive work and give data teams a more practical workflow from one place.
            </p>
            <footer className="text-secondary text-sm">
              &mdash; Rob, Founder of Spresso Data Studio
            </footer>
          </blockquote>
        </div>

        {/* Open Beta badge */}
        <div
          className="flex justify-center mt-8 animate-fade-in"
          style={{ animationDelay: '350ms' }}
        >
          <span className="rounded-full bg-accent/15 text-accent text-xs font-medium px-4 py-1.5 tracking-wide">
            Open Beta
          </span>
        </div>
      </div>
    </section>
  );
}
