import { useScrollReveal } from './useScrollReveal';

const platforms = [
  { name: 'LinkedIn', icon: LinkedInIcon, color: '#0A66C2' },
  { name: 'X', icon: XIcon, color: '#E7E9EA' },
  { name: 'Facebook', icon: FacebookIcon, color: '#1877F2' },
  { name: 'Bluesky', icon: BlueskyIcon, color: '#0085FF' },
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
            Content creation shouldn&rsquo;t feel like{' '}
            <span className="text-gradient-amber">the same job repeated over and over</span>
          </h2>
        </div>

        {/* Copy */}
        <div
          className={`mt-6 text-center scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '120ms' }}
        >
          <p className="text-text-secondary font-heading text-lg leading-relaxed max-w-2xl mx-auto">
            You have one idea. Then you rewrite it for LinkedIn. Rework it again for Facebook.
            Shorten it for X. Adjust it again for Bluesky. Spresso is built to reduce that
            repetitive work and help you move from one idea to multiple platform-ready posts from
            one workflow — and we&apos;re continuously integrating more platforms.
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
                  The repetitive way
                </p>
                <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap">
                  {platforms.map((platform, i) => (
                    <div key={platform.name} className="flex items-center gap-2 md:gap-3">
                      {i > 0 && (
                        <div className="flex flex-col items-center gap-0.5 text-text-tertiary/40">
                          <ArrowRepeatIcon />
                        </div>
                      )}
                      <div className="group flex flex-col items-center gap-1.5">
                        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-surface-3/80 border border-white/5 flex items-center justify-center transition-all duration-300 group-hover:border-white/10 group-hover:-translate-y-0.5">
                          <platform.icon color={platform.color} />
                        </div>
                        <span className="text-[10px] text-text-tertiary font-heading">
                          {platform.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs text-text-tertiary/60 mt-3 font-heading">
                  Rewrite &rarr; Rework &rarr; Shorten &rarr; Adjust &rarr; Repeat
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
                    <span className="text-sm text-text-primary font-heading">One idea</span>
                  </div>

                  {/* Flow arrow */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-px h-4 bg-gradient-to-b from-accent/40 to-accent/10" />
                    <FlowArrowDown />
                    <div className="w-px h-2 bg-gradient-to-b from-accent/10 to-transparent" />
                  </div>

                  {/* Four outputs */}
                  <div className="flex items-center justify-center gap-3 md:gap-4">
                    {platforms.map((platform, i) => (
                      <div
                        key={platform.name}
                        className="group flex flex-col items-center gap-1.5"
                        style={{ transitionDelay: `${400 + i * 80}ms` }}
                      >
                        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-surface-3/80 border border-accent/10 flex items-center justify-center shadow-[0_0_8px_rgba(255,214,10,0.08)] transition-all duration-300 group-hover:border-accent/25 group-hover:-translate-y-1 group-hover:shadow-[0_0_16px_rgba(255,214,10,0.15)]">
                          <platform.icon color={platform.color} />
                        </div>
                        <span className="text-[10px] text-text-secondary font-heading">
                          {platform.name}
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

function LinkedInIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function XIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function BlueskyIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 600 530" fill={color}>
      <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.72 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
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
