import type { Skill } from '@cc/shared';
import { Card } from '../ui/Card';
import { SkillIcon } from './SkillIcon';

const categoryColors: Record<string, string> = {
  repurpose: 'bg-purple-100 text-purple-700',
  generate: 'bg-blue-100 text-blue-700',
  research: 'bg-green-100 text-green-700',
  transform: 'bg-amber-100 text-amber-700',
  extract: 'bg-pink-100 text-pink-700',
  plan: 'bg-indigo-100 text-indigo-700',
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
        className="w-full text-left"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-brand-50 p-2">
            <SkillIcon category={skill.category} className="h-5 w-5 text-brand-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-gray-900 truncate">{skill.name}</h4>
              {skill.source === 'builtin' && (
                <span className="shrink-0 text-xs text-gray-400">built-in</span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{skill.description}</p>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    categoryColors[skill.category] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {skill.category}
                </span>
                <span className="text-xs text-gray-400">v{skill.version}</span>
              </div>
              {canEdit && onEdit && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEdit(); } }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-800"
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
