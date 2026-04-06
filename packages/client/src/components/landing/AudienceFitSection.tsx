import { useScrollReveal } from './useScrollReveal';

const audiences = [
  {
    icon: '\u{1F3AF}',
    title: 'Coaches',
    description: 'Turn your expertise into a consistent content engine',
  },
  {
    icon: '\u{1F4BC}',
    title: 'Consultants',
    description: 'Build authority without spending hours on every post',
  },
  {
    icon: '\u{1F680}',
    title: 'Founder-Creators',
    description: 'Stay visible while you build your business',
  },
  {
    icon: '\u26A1',
    title: 'Solo Operators',
    description: 'Maintain presence without a content team',
  },
];

export function AudienceFitSection() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  return (
    <section ref={ref} className={`scroll-reveal ${isVisible ? 'visible' : ''} py-24 px-6`}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-primary text-center mb-16 max-w-3xl mx-auto leading-tight">
          Built for people who create content because their business depends on it
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {audiences.map((audience, index) => (
            <div
              key={audience.title}
              className="group bg-surface-2/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center
                transition-all duration-300 ease-out
                hover:-translate-y-1 hover:shadow-[0_0_24px_rgba(255,214,10,0.1)] hover:border-white/10
                animate-fade-in"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <div className="text-4xl mb-4">{audience.icon}</div>
              <h3 className="text-lg font-semibold text-primary mb-2">{audience.title}</h3>
              <p className="text-sm text-secondary leading-relaxed">{audience.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
