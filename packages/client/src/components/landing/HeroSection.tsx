import { useCallback, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { PulsingGrid } from './PulsingGrid';

// Data modelling output preview cards
const HERO_OUTPUTS = [
  {
    name: 'Star Schema',
    color: '#3B82F6',
    icon: '⭐',
    rotation: -3,
    text: 'fact_sales → dim_customer, dim_product, dim_date, dim_store',
    meta: 'Kimball',
  },
  {
    name: 'Data Vault',
    color: '#8B5CF6',
    icon: '🔐',
    rotation: 1,
    text: 'hub_customer → sat_customer_details, lnk_customer_order',
    meta: 'DV 2.0',
  },
  {
    name: 'Data Dictionary',
    color: '#10B981',
    icon: '📖',
    rotation: 4,
    text: 'customer_id: UUID PK — Unique identifier for each customer entity',
    meta: 'Auto-gen',
  },
];

interface HeroSectionProps {
  onGetStarted: () => void;
}

export function HeroSection({ onGetStarted }: HeroSectionProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left - rect.width / 2) / rect.width,
      y: (e.clientY - rect.top - rect.height / 2) / rect.height,
    });
  }, []);

  return (
    <section className="relative min-h-screen flex items-center" onMouseMove={handleMouseMove}>
      {/* Background layers */}
      <div className="absolute inset-0 overflow-hidden">
        <PulsingGrid opacity={0.5} centerY={0.4} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(255,214,10,0.05)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-0" />
      </div>

      {/* Cursor glow */}
      <div
        className="pointer-events-none absolute h-[500px] w-[500px] rounded-full opacity-[0.04] transition-all duration-1000 ease-out"
        style={{
          background: 'radial-gradient(circle, rgba(255,214,10,0.5) 0%, transparent 70%)',
          left: `calc(50% + ${mousePos.x * 200}px - 250px)`,
          top: `calc(50% + ${mousePos.y * 200}px - 250px)`,
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl w-full px-6 pt-28 pb-20">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-8 items-center">
          {/* Left — Copy */}
          <div className="text-center lg:text-left pt-8">
            {/* Headline */}
            <h1
              className="font-display text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.05] tracking-tight text-text-primary animate-slide-up"
              style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            >
              Turn raw schemas into{' '}
              <span className="text-gradient-amber">production-ready models</span>
            </h1>

            {/* Subheadline */}
            <p
              className="mt-6 text-lg md:text-xl text-text-secondary font-heading leading-relaxed max-w-lg mx-auto lg:mx-0 animate-slide-up"
              style={{ animationDelay: '350ms', animationFillMode: 'both' }}
            >
              Spresso helps data engineers and architects transform source schemas into Kimball star
              schemas, Data Vault models, ERDs, and data dictionaries — powered by AI.
            </p>

            {/* CTAs */}
            <div
              className="mt-10 flex flex-col sm:flex-row items-center gap-4 lg:justify-start justify-center animate-slide-up"
              style={{ animationDelay: '500ms', animationFillMode: 'both' }}
            >
              <button
                onClick={onGetStarted}
                className="group relative flex items-center gap-3 px-8 py-4 text-base font-semibold text-text-inverse bg-gradient-to-r from-accent to-amber-500 rounded-xl hover:from-accent-hover hover:to-amber-400 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow-strong"
              >
                Start modelling for free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* Right — Visual mockup with overlapping platform cards */}
          <div
            className="relative hidden lg:block animate-slide-up"
            style={{ animationDelay: '300ms', animationFillMode: 'both' }}
          >
            <div
              className="relative transition-transform duration-700 ease-out"
              style={{
                transform: `perspective(1000px) rotateY(${mousePos.x * 2}deg) rotateX(${-mousePos.y * 2}deg)`,
              }}
            >
              {/* Editor mockup */}
              <div className="relative z-10 editor-surface rounded-2xl p-5">
                {/* Editor header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="ml-3 text-[10px] font-mono text-text-tertiary/50">
                    spresso — data modelling studio
                  </span>
                </div>

                {/* Model type tabs */}
                <div className="flex gap-2 mb-3">
                  {[
                    { name: 'Star Schema', color: '#3B82F6' },
                    { name: 'Data Vault', color: '#8B5CF6' },
                    { name: '3NF', color: '#10B981' },
                    { name: 'Dictionary', color: '#F59E0B' },
                  ].map((p, i) => (
                    <div
                      key={p.name}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                        i === 0
                          ? 'bg-accent/15 text-accent border border-accent/20'
                          : 'bg-surface-3/60 text-text-tertiary border border-transparent'
                      }`}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>

                {/* Schema content */}
                <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
                  <p className="text-blue-400">
                    CREATE TABLE <span className="text-text-primary">fact_sales</span> (
                  </p>
                  <p className="text-text-secondary/70 pl-4">
                    sale_id <span className="text-amber-400">UUID</span> PRIMARY KEY,
                  </p>
                  <p className="text-text-secondary/70 pl-4">
                    customer_key <span className="text-amber-400">UUID</span> REFERENCES
                    dim_customer,
                  </p>
                  <p className="text-text-secondary/70 pl-4">
                    product_key <span className="text-amber-400">UUID</span> REFERENCES dim_product,
                  </p>
                  <p className="text-text-secondary/70 pl-4">
                    amount <span className="text-amber-400">DECIMAL</span>(12,2)
                  </p>
                  <p className="text-blue-400">);</p>
                </div>

                {/* Bottom toolbar */}
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-border-subtle">
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded bg-surface-3/50 text-[9px] font-mono text-text-tertiary">
                      AI-generated
                    </div>
                    <span className="text-[10px] text-text-tertiary/50">from 12 source tables</span>
                  </div>
                  <div className="px-3 py-1 rounded-md bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent">
                    Export DDL
                  </div>
                </div>
              </div>

              {/* Output cards — overlapping row */}
              <div className="relative z-20 flex justify-center gap-3 -mt-10 px-1">
                {HERO_OUTPUTS.map((output, i) => (
                  <div
                    key={output.name}
                    className="w-[160px] shrink-0 rounded-xl border border-border-subtle bg-surface-1 backdrop-blur-md p-3 shadow-dark-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-glow-accent"
                    style={{
                      transform: `rotate(${output.rotation}deg) translateY(${i === 1 ? -8 : 0}px)`,
                      animation: `slide-up-lg 700ms cubic-bezier(0.22, 1, 0.36, 1) both`,
                      animationDelay: `${700 + i * 120}ms`,
                      boxShadow: `0 0 24px ${output.color}18, 0 8px 24px rgba(0,0,0,0.5)`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold"
                          style={{ backgroundColor: `${output.color}20`, color: output.color }}
                        >
                          {output.icon}
                        </div>
                        <span className="text-[11px] font-semibold text-text-primary">
                          {output.name}
                        </span>
                      </div>
                      <span className="text-[8px] font-mono text-text-tertiary">{output.meta}</span>
                    </div>
                    <p className="text-[10px] text-text-secondary/70 leading-relaxed line-clamp-2 font-mono">
                      {output.text}
                    </p>
                    <div
                      className="mt-2 h-px w-full rounded"
                      style={{
                        background: `linear-gradient(to right, ${output.color}40, transparent)`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-fade-in"
        style={{ animationDelay: '1200ms', animationFillMode: 'both' }}
      >
        <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-heading">
          Scroll to explore
        </span>
        <div className="h-8 w-5 rounded-full border border-border-subtle flex items-start justify-center p-1">
          <div className="h-1.5 w-1 rounded-full bg-accent animate-float" />
        </div>
      </div>
    </section>
  );
}
