import { useState } from 'react';
import type { Skill, SkillVisibility } from '@cc/shared';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SkillIcon } from './SkillIcon';
import { Heart, GitFork, Globe, Lock, Link2, Eye, EyeOff, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSkillActions } from '../../hooks/useSkills';

interface SkillDetailProps {
  skill: Skill;
  onClose: () => void;
  onEdit?: () => void;
  onFork?: () => void;
  canEdit?: boolean;
  onSkillUpdated?: (updated: Skill) => void;
}

const visibilityOptions: { value: SkillVisibility; label: string; icon: typeof Globe }[] = [
  { value: 'private', label: 'Private', icon: Lock },
  { value: 'unlisted', label: 'Unlisted', icon: Link2 },
  { value: 'public', label: 'Public', icon: Globe },
];

export function SkillDetail({
  skill,
  onClose,
  onEdit,
  onFork,
  canEdit,
  onSkillUpdated,
}: SkillDetailProps) {
  const config = skill.config as Skill['config'];
  const { user } = useAuth();
  const { toggleFavorite, updateVisibility: updateVis } = useSkillActions();
  const [localSkill, setLocalSkill] = useState(skill);
  const isOwner = user?.id === skill.userId;

  const handleFavorite = async () => {
    const result = await toggleFavorite(skill.id);
    setLocalSkill((s) => ({
      ...s,
      isFavorited: result.favorited,
      favoriteCount: result.favorited ? s.favoriteCount + 1 : Math.max(s.favoriteCount - 1, 0),
    }));
  };

  const handleVisibilityChange = async (visibility: SkillVisibility) => {
    const updated = await updateVis(skill.id, visibility);
    setLocalSkill((s) => ({ ...s, visibility: updated.visibility }));
    onSkillUpdated?.(updated);
  };

  const promptsHidden = config.promptTemplate === '[hidden]' || !config.promptTemplate;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent-dim p-3">
            <SkillIcon category={skill.category} className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{skill.name}</h3>
            <p className="text-sm text-text-tertiary">{skill.description}</p>
            {skill.creatorDisplayName && (
              <p className="mt-0.5 text-xs text-text-tertiary">
                by <span className="text-accent">{skill.creatorDisplayName}</span>
              </p>
            )}
            {skill.forkedFromId && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
                <GitFork className="h-3 w-3" /> Forked
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Favorite button */}
          {user && !isOwner && (
            <Button variant="ghost" size="sm" onClick={handleFavorite}>
              <Heart
                className={`h-4 w-4 ${localSkill.isFavorited ? 'fill-red-500 text-red-500' : ''}`}
              />
            </Button>
          )}
          {/* Fork button */}
          {onFork && !isOwner && (
            <Button variant="secondary" size="sm" onClick={onFork}>
              <GitFork className="mr-1 h-4 w-4" /> Fork
            </Button>
          )}
          {canEdit && onEdit && (
            <Button size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>

      {/* Visibility controls for owner */}
      {isOwner && (
        <Card padding="md">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-text-primary">Visibility</h4>
              <p className="text-xs text-text-tertiary">Control who can see this skill</p>
            </div>
            <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
              {visibilityOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = localSkill.visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleVisibilityChange(opt.value)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-accent text-surface-0 shadow-sm'
                        : 'text-text-tertiary hover:text-text-primary'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Show prompts toggle */}
          <div className="mt-3 flex items-center justify-between border-t border-border-default pt-3">
            <div className="flex items-center gap-2">
              {localSkill.showPrompts ? (
                <Eye className="h-4 w-4 text-green-400" />
              ) : (
                <EyeOff className="h-4 w-4 text-text-tertiary" />
              )}
              <div>
                <p className="text-sm text-text-primary">Show prompts to others</p>
                <p className="text-xs text-text-tertiary">
                  {localSkill.showPrompts
                    ? 'Others can see your prompt template'
                    : 'Prompt template is hidden from others'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                // Use updateSkill to toggle showPrompts
                const { data } = await (
                  await import('../../lib/api')
                ).api.put(`/skills/${skill.id}`, {
                  showPrompts: !localSkill.showPrompts,
                });
                setLocalSkill((s) => ({ ...s, showPrompts: data.data.showPrompts }));
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                localSkill.showPrompts ? 'bg-accent' : 'bg-surface-3'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm ${
                  localSkill.showPrompts ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </Card>
      )}

      {/* Stats bar */}
      {(skill.usageCount > 0 || skill.favoriteCount > 0 || skill.forkCount > 0) && (
        <div className="flex items-center gap-4 text-sm text-text-tertiary">
          {skill.usageCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {skill.usageCount} uses
            </span>
          )}
          {skill.favoriteCount > 0 && (
            <span className="flex items-center gap-1">
              <Heart className="h-4 w-4" /> {localSkill.favoriteCount} favorites
            </span>
          )}
          {skill.forkCount > 0 && (
            <span className="flex items-center gap-1">
              <GitFork className="h-4 w-4" /> {skill.forkCount} forks
            </span>
          )}
        </div>
      )}

      {/* Inputs */}
      <Card padding="md">
        <h4 className="mb-2 font-medium text-text-primary">Inputs</h4>
        {config.inputs.length > 0 ? (
          <div className="space-y-2">
            {config.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-3 text-sm">
                <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                  {input.key}
                </span>
                <span className="text-text-secondary">{input.label}</span>
                <span className="text-text-tertiary">({input.type})</span>
                {input.required && <span className="text-xs text-red-500">required</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">No inputs defined</p>
        )}
      </Card>

      {/* Outputs */}
      <Card padding="md">
        <h4 className="mb-2 font-medium text-text-primary">Outputs</h4>
        {config.outputs.length > 0 ? (
          <div className="space-y-2">
            {config.outputs.map((output) => (
              <div key={output.key} className="flex items-center gap-3 text-sm">
                <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                  {output.key}
                </span>
                <span className="text-text-secondary">{output.label}</span>
                <span className="text-text-tertiary">({output.type})</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">No outputs defined</p>
        )}
      </Card>

      {/* Prompt Template — respect showPrompts */}
      {promptsHidden && !isOwner ? (
        <Card padding="md">
          <div className="flex items-center gap-2 text-text-tertiary">
            <EyeOff className="h-4 w-4" />
            <p className="text-sm">The creator has hidden the prompt template for this skill.</p>
          </div>
        </Card>
      ) : (
        <>
          <Card padding="md">
            <h4 className="mb-2 font-medium text-text-primary">Prompt Template</h4>
            <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-text-secondary whitespace-pre-wrap">
              {config.promptTemplate}
            </pre>
          </Card>

          {config.systemPrompt && (
            <Card padding="md">
              <h4 className="mb-2 font-medium text-text-primary">System Prompt</h4>
              <pre className="max-h-32 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-text-secondary whitespace-pre-wrap">
                {config.systemPrompt}
              </pre>
            </Card>
          )}
        </>
      )}

      {/* Configuration */}
      <Card padding="md">
        <h4 className="mb-2 font-medium text-text-primary">Configuration</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-text-tertiary">Category</p>
            <p className="font-medium">{skill.category}</p>
          </div>
          <div>
            <p className="text-text-tertiary">Version</p>
            <p className="font-medium">{skill.version}</p>
          </div>
          <div>
            <p className="text-text-tertiary">Source</p>
            <p className="font-medium">{skill.source}</p>
          </div>
          <div>
            <p className="text-text-tertiary">Visibility</p>
            <p className="font-medium capitalize">{localSkill.visibility}</p>
          </div>
          {config.temperature !== undefined && (
            <div>
              <p className="text-text-tertiary">Temperature</p>
              <p className="font-medium">{config.temperature}</p>
            </div>
          )}
          {config.maxTokens !== undefined && (
            <div>
              <p className="text-text-tertiary">Max Tokens</p>
              <p className="font-medium">{config.maxTokens}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
