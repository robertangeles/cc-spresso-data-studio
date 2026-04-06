interface PresenceIndicatorProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
} as const;

export function PresenceIndicator({ isOnline, size = 'sm' }: PresenceIndicatorProps) {
  const sizeClasses = sizeMap[size];

  return (
    <span className="relative inline-flex flex-shrink-0">
      <span
        className={`inline-block rounded-full ${sizeClasses} ${
          isOnline
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
            : 'bg-zinc-500 opacity-50'
        }`}
        aria-label={isOnline ? 'Online' : 'Offline'}
      />
      {isOnline && (
        <span
          className={`absolute inset-0 rounded-full bg-emerald-400/40 animate-ping`}
          style={{ animationDuration: '2s' }}
        />
      )}
    </span>
  );
}
