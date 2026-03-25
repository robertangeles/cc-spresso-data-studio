import type { Skill } from '@cc/shared';
import { Card } from '../ui/Card';
import { SkillIcon } from './SkillIcon';

const categoryColors: Record<string, string> = {
  repurpose: 'bg-purple-500/10 text-purple-400',
  generate: 'bg-blue-500/10 text-blue-400',
  research: 'bg-green-500/10 text-green-400',
  transform: 'bg-amber-500/10 text-amber-400',
  extract: 'bg-pink-500/10 text-pink-400',
  plan: 'bg-indigo-500/10 text-indigo-400',
};

interface SkillCardProps {
  skill: Skill;
  onClick?: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
}

export function SkillCard({ skill, onClick, onEdit, canEdit }: SkillCardProps) {
  return (
    <Card padding="md">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left transition-all duration-300 ease-spring"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-accent-dim p-2">
            <SkillIcon category={skill.category} className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-text-primary truncate">{skill.name}</h4>
              {skill.source === 'builtin' && (
                <span className="shrink-0 text-xs text-text-tertiary">built-in</span>
              )}
            </div>
            <p className="mt-1 text-sm text-text-secondary line-clamp-2">{skill.description}</p>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    categoryColors[skill.category] || 'bg-surface-3 text-text-secondary'
                  }`}
                >
                  {skill.category}
                </span>
                <span className="text-xs text-text-tertiary">v{skill.version}</span>
              </div>
              {canEdit && onEdit && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEdit(); } }}
                  className="text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Edit
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </Card>
  );
}
