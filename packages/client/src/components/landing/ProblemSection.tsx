import { useScrollReveal } from './useScrollReveal';

const outputs = [
  { name: 'Star Schema', icon: StarIcon, color: '#3B82F6' },
  { name: 'Data Vault', icon: VaultIcon, color: '#8B5CF6' },
  { name: 'ERD', icon: DiagramIcon, color: '#10B981' },
  { name: 'Dictionary', icon: BookIcon, color: '#F59E0B' },
];

export function ProblemSection() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });

  return (
    <section ref={ref} className="relative py-24 px-6 overflow-hidden">
      {/* Radial gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,214,10,0.04)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-surface-0 via-transparent to-surface-0" />

      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Heading */}
        <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight text-text-primary leading-tight">
            Data modelling shouldn&rsquo;t take{' '}
            <span className="text-gradient-amber">weeks of manual work</span>
          </h2>
        </div>

        {/* Copy */}
        <div
          className={`mt-6 text-center scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '120ms' }}
        >
          <p className="text-text-secondary font-heading text-lg leading-relaxed max-w-2xl mx-auto">
            You have source tables. Then you manually design the star schema. Draw the ERD. Write
            the data dictionary. Map the business rules. Spresso is built to automate that — paste
            your DDL, and AI generates production-ready dimensional models, ERDs, and documentation
            in minutes, not weeks.
          </p>
        </div>

        {/* Visual: Pain vs Relief */}
        <div
          className={`mt-16 scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '280ms' }}
        >
          <div className="relative rounded-2xl bg-surface-2/50 backdrop-blur-xl border border-white/5 p-8 md:p-10 shadow-[0_0_40px_rgba(255,214,10,0.06)]">
            {/* Pain: repetitive arrows */}
            <div className="flex flex-col items-center gap-10">
              {/* The Pain */}
              <div className="w-full">
                <p className="text-xs uppercase tracking-widest text-text-tertiary text-center mb-5 font-heading">
                  The manual way
                </p>
                <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap">
                  {[
                    'Analyse Sources',
                    'Design Schema',
                    'Draw ERD',
                    'Write Dictionary',
                    'Map Rules',
                  ].map((step, i) => (
                    <div key={step} className="flex items-center gap-2 md:gap-3">
                      {i > 0 && (
                        <div className="flex flex-col items-center gap-0.5 text-text-tertiary/40">
                          <ArrowRepeatIcon />
                        </div>
                      )}
                      <div className="group flex flex-col items-center gap-1.5">
                        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-surface-3/80 border border-white/5 flex items-center justify-center transition-all duration-300 group-hover:border-white/10 group-hover:-translate-y-0.5">
                          <span className="text-[10px] font-mono text-text-tertiary">{i + 1}</span>
                        </div>
                        <span className="text-[10px] text-text-tertiary font-heading">{step}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs text-text-tertiary/60 mt-3 font-heading">
                  Weeks of manual effort &rarr; Error-prone &rarr; Inconsistent
                </p>
              </div>

              {/* Divider */}
              <div className="w-full flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="text-xs text-text-tertiary font-heading uppercase tracking-wider">
                  vs
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* The Relief */}
              <div className="w-full">
                <p className="text-xs uppercase tracking-widest text-accent text-center mb-5 font-heading">
                  The Spresso way
                </p>
                <div className="flex flex-col items-center gap-4">
                  {/* Single input */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-accent/20 to-amber-600/10 border border-accent/20 flex items-center justify-center shadow-[0_0_12px_rgba(255,214,10,0.15)] transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,214,10,0.25)] hover:-translate-y-0.5">
                      <IdeaIcon />
                    </div>
                    <span className="text-sm text-text-primary font-heading">Source DDL</span>
                  </div>

                  {/* Flow arrow */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-px h-4 bg-gradient-to-b from-accent/40 to-accent/10" />
                    <FlowArrowDown />
                    <div className="w-px h-2 bg-gradient-to-b from-accent/10 to-transparent" />
                  </div>

                  {/* Four outputs */}
                  <div className="flex items-center justify-center gap-3 md:gap-4">
                    {outputs.map((output, i) => (
                      <div
                        key={output.name}
                        className="group flex flex-col items-center gap-1.5"
                        style={{ transitionDelay: `${400 + i * 80}ms` }}
                      >
                        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-surface-3/80 border border-accent/10 flex items-center justify-center shadow-[0_0_8px_rgba(255,214,10,0.08)] transition-all duration-300 group-hover:border-accent/25 group-hover:-translate-y-1 group-hover:shadow-[0_0_16px_rgba(255,214,10,0.15)]">
                          <output.icon color={output.color} />
                        </div>
                        <span className="text-[10px] text-text-secondary font-heading">
                          {output.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline SVG icons                                                  */
/* ------------------------------------------------------------------ */

function StarIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function VaultIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}

function DiagramIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="8" height="6" rx="1" />
      <rect x="14" y="3" width="8" height="6" rx="1" />
      <rect x="8" y="15" width="8" height="6" rx="1" />
      <path d="M6 9v2a2 2 0 002 2h8a2 2 0 002-2V9" />
      <path d="M12 13v2" />
    </svg>
  );
}

function BookIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  );
}

function ArrowRepeatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function IdeaIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,214,10,0.9)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v1M12 21v1M4.22 4.22l.71.71M18.36 18.36l.71.71M1 12h1M21 12h1M4.22 19.78l.71-.71M18.36 5.64l.71-.71" />
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function FlowArrowDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,214,10,0.6)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
