import type { Skill } from '@cc/shared';
import { Card } from '../ui/Card';
import { SkillIcon } from './SkillIcon';
import { Heart, GitFork, Users, Lock, Link2, Globe } from 'lucide-react';

const categoryColors: Record<string, string> = {
  repurpose: 'bg-purple-500/10 text-purple-400',
  generate: 'bg-blue-500/10 text-blue-400',
  research: 'bg-green-500/10 text-green-400',
  transform: 'bg-amber-500/10 text-amber-400',
  extract: 'bg-pink-500/10 text-pink-400',
  plan: 'bg-indigo-500/10 text-indigo-400',
};

const visibilityConfig = {
  private: { icon: Lock, label: 'Private', color: 'text-text-tertiary' },
  unlisted: { icon: Link2, label: 'Unlisted', color: 'text-amber-400' },
  public: { icon: Globe, label: 'Public', color: 'text-green-400' },
};

interface SkillCardProps {
  skill: Skill;
  onClick?: () => void;
  onEdit?: () => void;
  onFork?: () => void;
  onFavorite?: () => void;
  canEdit?: boolean;
  showCreator?: boolean;
}

export function SkillCard({
  skill,
  onClick,
  onEdit,
  onFork,
  onFavorite,
  canEdit,
  showCreator = false,
}: SkillCardProps) {
  const vis = visibilityConfig[skill.visibility] ?? visibilityConfig.private;
  const VisIcon = vis.icon;

  return (
    <Card
      padding="md"
      className="group transition-all duration-300 hover:-translate-y-1 hover:shadow-dark-lg"
    >
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

            {/* Creator attribution for community skills */}
            {showCreator && skill.creatorDisplayName && (
              <p className="mt-1.5 text-xs text-text-tertiary">
                by <span className="text-accent">{skill.creatorDisplayName}</span>
              </p>
            )}

            {/* Forked from attribution */}
            {skill.forkedFromId && (
              <p className="mt-1 flex items-center gap-1 text-xs text-text-tertiary">
                <GitFork className="h-3 w-3" /> Forked
              </p>
            )}

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    categoryColors[skill.category] || 'bg-surface-3 text-text-secondary'
                  }`}
                >
                  {skill.category}
                </span>
                <span
                  className="flex items-center gap-0.5 text-xs text-text-tertiary"
                  title={vis.label}
                >
                  <VisIcon className={`h-3 w-3 ${vis.color}`} />
                </span>
              </div>

              {/* Stats + actions */}
              <div className="flex items-center gap-3">
                {/* Usage count badge */}
                {skill.usageCount > 0 && (
                  <span
                    className="flex items-center gap-1 text-xs text-text-tertiary"
                    title="Times used"
                  >
                    <Users className="h-3 w-3" />
                    {skill.usageCount}
                  </span>
                )}

                {/* Fork count */}
                {skill.forkCount > 0 && (
                  <span
                    className="flex items-center gap-1 text-xs text-text-tertiary"
                    title="Forks"
                  >
                    <GitFork className="h-3 w-3" />
                    {skill.forkCount}
                  </span>
                )}

                {/* Favorite button */}
                {onFavorite && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFavorite();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        onFavorite();
                      }
                    }}
                    className="transition-colors"
                    title={skill.isFavorited ? 'Unfavorite' : 'Favorite'}
                  >
                    <Heart
                      className={`h-3.5 w-3.5 ${
                        skill.isFavorited
                          ? 'fill-red-500 text-red-500'
                          : 'text-text-tertiary hover:text-red-400'
                      }`}
                    />
                  </span>
                )}

                {/* Fork button */}
                {onFork && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFork();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        onFork();
                      }
                    }}
                    className="text-xs font-medium text-text-tertiary hover:text-accent transition-colors"
                    title="Fork to My Workshop"
                  >
                    <GitFork className="h-3.5 w-3.5" />
                  </span>
                )}

                {/* Edit button */}
                {canEdit && onEdit && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        onEdit();
                      }
                    }}
                    className="text-xs font-medium text-accent hover:text-accent-hover"
                  >
                    Edit
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </button>
    </Card>
  );
}
