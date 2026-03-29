const CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  instagram: 2200,
  threads: 500,
  bluesky: 300,
  blog: 50000,
  email: 50000,
  youtube: 5000,
};

interface CharacterCountBarProps {
  text: string;
  platformSlug: string | null;
}

export function CharacterCountBar({ text, platformSlug }: CharacterCountBarProps) {
  if (!platformSlug) return null;

  const limit = CHAR_LIMITS[platformSlug];
  if (!limit) return null;

  const count = text.length;
  const ratio = count / limit;

  const color =
    ratio > 1
      ? 'text-red-400 bg-red-500/10'
      : ratio > 0.8
        ? 'text-amber-400 bg-amber-500/10'
        : 'text-text-tertiary bg-surface-3';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${color}`}
    >
      {count.toLocaleString()}/{limit.toLocaleString()}
    </span>
  );
}
