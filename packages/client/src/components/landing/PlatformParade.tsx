import { useScrollReveal } from './useScrollReveal';

const PLATFORMS_ROW_1 = [
  { name: 'Twitter / X', color: '#1DA1F2', limit: '280 chars', emoji: '𝕏' },
  { name: 'LinkedIn', color: '#0A66C2', limit: '3,000 chars', emoji: 'in' },
  { name: 'Instagram', color: '#E4405F', limit: '2,200 chars', emoji: '📸' },
  { name: 'Facebook', color: '#1877F2', limit: '63,206 chars', emoji: 'f' },
  { name: 'Threads', color: '#FFFFFF', limit: '500 chars', emoji: '🧵' },
  { name: 'Bluesky', color: '#0085FF', limit: '300 chars', emoji: '🦋' },
];

const PLATFORMS_ROW_2 = [
  { name: 'TikTok', color: '#00F2EA', limit: '150 chars', emoji: '🎵' },
  { name: 'Pinterest', color: '#E60023', limit: '500 chars', emoji: '📌' },
  { name: 'YouTube', color: '#FF0000', limit: '5,000 chars', emoji: '▶️' },
  { name: 'Blog', color: '#10B981', limit: 'Unlimited', emoji: '📝' },
  { name: 'Email', color: '#8B5CF6', limit: 'Unlimited', emoji: '✉️' },
  { name: 'Newsletter', color: '#F59E0B', limit: 'Unlimited', emoji: '📰' },
];

function PlatformPill({ name, color, limit, emoji }: (typeof PLATFORMS_ROW_1)[0]) {
  return (
    <div
      className="group flex items-center gap-3 px-5 py-3 rounded-xl border border-border-subtle bg-surface-2/60 backdrop-blur-sm hover:scale-105 hover:bg-surface-3/80 transition-all duration-300 cursor-default shrink-0 mx-2"
      style={{
        ['--pill-glow-color' as string]: `${color}30`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          `0 0 20px ${color}20, 0 0 40px ${color}10`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}30`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '';
        (e.currentTarget as HTMLElement).style.borderColor = '';
      }}
    >
      {/* Icon */}
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {emoji}
      </div>

      {/* Info */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary whitespace-nowrap">{name}</p>
        <p className="text-[10px] font-mono text-text-tertiary whitespace-nowrap">{limit}</p>
      </div>

      {/* Accent bar */}
      <div
        className="w-0.5 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 shrink-0"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function PlatformParade() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  // Double the arrays for seamless loop
  const row1Items = [...PLATFORMS_ROW_1, ...PLATFORMS_ROW_1];
  const row2Items = [...PLATFORMS_ROW_2, ...PLATFORMS_ROW_2];

  return (
    <section ref={ref} className="relative py-28 overflow-hidden">
      {/* Gradient edges for fade-out effect */}
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-surface-0 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-surface-0 to-transparent z-10 pointer-events-none" />

      <div className="relative z-0">
        {/* Header */}
        <div className={`text-center mb-14 px-6 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-4xl md:text-5xl tracking-tight text-text-primary">
            One click. <span className="text-gradient-amber">Twelve platforms.</span>
          </h2>
          <p className="mt-4 text-lg text-text-secondary font-heading max-w-xl mx-auto">
            Character limits, tone, and formatting — all handled automatically.
          </p>
        </div>

        {/* Marquee Row 1 — scrolls left */}
        <div
          className={`mb-4 scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '200ms' }}
        >
          <div className="marquee-row marquee-left">
            {row1Items.map((p, i) => (
              <PlatformPill key={`${p.name}-${i}`} {...p} />
            ))}
          </div>
        </div>

        {/* Marquee Row 2 — scrolls right */}
        <div
          className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '350ms' }}
        >
          <div className="marquee-row marquee-right">
            {row2Items.map((p, i) => (
              <PlatformPill key={`${p.name}-${i}`} {...p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
