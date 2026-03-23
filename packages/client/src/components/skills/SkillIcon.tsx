import { RefreshCw, Sparkles, Search, Zap, Gem, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  repurpose: RefreshCw,
  generate: Sparkles,
  research: Search,
  transform: Zap,
  extract: Gem,
  plan: ClipboardList,
};

interface SkillIconProps {
  category: string;
  className?: string;
}

export function SkillIcon({ category, className = 'h-5 w-5' }: SkillIconProps) {
  const Icon = CATEGORY_ICONS[category];
  if (Icon) return <Icon className={className} />;
  return <Sparkles className={className} />;
}

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? Sparkles;
}
