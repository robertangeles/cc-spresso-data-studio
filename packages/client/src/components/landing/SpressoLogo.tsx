interface SpressoLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}

const SIZES = {
  sm: { box: 'h-8 w-8', icon: 'h-5 w-5', text: 'text-lg', rounded: 'rounded-lg' },
  md: { box: 'h-10 w-10', icon: 'h-6 w-6', text: 'text-xl', rounded: 'rounded-xl' },
  lg: { box: 'h-11 w-11', icon: 'h-7 w-7', text: 'text-2xl', rounded: 'rounded-xl' },
};

function CoffeeMugIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" className={className}>
      <path
        d="M32 48h64a4 4 0 0 1 4 4v36a24 24 0 0 1-24 24H52a24 24 0 0 1-24-24V52a4 4 0 0 1 4-4z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M96 58h4a12 12 0 0 1 0 24h-4"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M50 38c0-6 4-10 4-16"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M64 34c0-6 4-10 4-16"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M78 38c0-6 4-10 4-16"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="44"
        y1="68"
        x2="72"
        y2="68"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
      <line
        x1="44"
        y1="78"
        x2="84"
        y2="78"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
      <line
        x1="44"
        y1="88"
        x2="66"
        y2="88"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}

export function SpressoLogo({ size = 'md', showName = true }: SpressoLogoProps) {
  const s = SIZES[size];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex ${s.box} items-center justify-center ${s.rounded} bg-accent-dim border border-accent/25 shadow-glow-accent text-accent`}
      >
        <CoffeeMugIcon className={s.icon} />
      </div>
      {showName && (
        <span className={`font-brand font-bold ${s.text} text-text-primary tracking-tight`}>
          Spresso
        </span>
      )}
    </div>
  );
}
