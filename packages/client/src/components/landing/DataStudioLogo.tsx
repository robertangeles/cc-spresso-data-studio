interface DataStudioLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}

const SIZES = {
  sm: { box: 'h-8 w-8', icon: 'h-5 w-5', text: 'text-lg', rounded: 'rounded-lg' },
  md: { box: 'h-10 w-10', icon: 'h-6 w-6', text: 'text-xl', rounded: 'rounded-xl' },
  lg: { box: 'h-11 w-11', icon: 'h-7 w-7', text: 'text-2xl', rounded: 'rounded-xl' },
};

function DataStudioIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" className={className}>
      {/* Stacked cylinders — classic data/database motif */}
      <ellipse cx="64" cy="36" rx="32" ry="12" fill="currentColor" opacity="0.9" />
      <path
        d="M32 36v16c0 6.627 14.327 12 32 12s32-5.373 32-12V36"
        stroke="currentColor"
        strokeWidth="0"
        fill="currentColor"
        opacity="0.6"
      />
      <ellipse cx="64" cy="52" rx="32" ry="12" fill="currentColor" opacity="0.35" />
      <path
        d="M32 52v16c0 6.627 14.327 12 32 12s32-5.373 32-12V52"
        stroke="currentColor"
        strokeWidth="0"
        fill="currentColor"
        opacity="0.45"
      />
      <ellipse cx="64" cy="68" rx="32" ry="12" fill="currentColor" opacity="0.25" />
      <path
        d="M32 68v16c0 6.627 14.327 12 32 12s32-5.373 32-12V68"
        stroke="currentColor"
        strokeWidth="0"
        fill="currentColor"
        opacity="0.35"
      />
      <ellipse cx="64" cy="84" rx="32" ry="12" fill="currentColor" opacity="0.2" />
      {/* Subtle sparkle accent */}
      <circle cx="88" cy="32" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="94" cy="26" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function DataStudioLogo({ size = 'md', showName = true }: DataStudioLogoProps) {
  const s = SIZES[size];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex ${s.box} items-center justify-center ${s.rounded} bg-accent-dim border border-accent/25 shadow-glow-accent text-accent`}
      >
        <DataStudioIcon className={s.icon} />
      </div>
      {showName && (
        <span className={`font-brand font-bold ${s.text} text-text-primary tracking-tight`}>
          Spresso
        </span>
      )}
    </div>
  );
}

/** @deprecated Use DataStudioLogo instead */
export const SpressoLogo = DataStudioLogo;
