interface UnreadBadgeProps {
  count: number;
}

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) return null;

  const display = count > 99 ? '99+' : String(count);

  return (
    <span className="animate-scale-in inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-gradient-to-r from-accent to-amber-600 text-xs font-bold text-white shadow-[0_0_8px_rgba(255,214,10,0.3)]">
      {display}
    </span>
  );
}
