import type { Skill } from '@cc/shared';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SkillIcon } from './SkillIcon';

interface SkillDetailProps {
  skill: Skill;
  onClose: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
}

export function SkillDetail({ skill, onClose, onEdit, canEdit }: SkillDetailProps) {
  const config = skill.config as Skill['config'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent-dim p-3">
            <SkillIcon category={skill.category} className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{skill.name}</h3>
            <p className="text-sm text-text-tertiary">{skill.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
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
            <p className="text-text-tertiary">Published</p>
            <p className="font-medium">{skill.isPublished ? 'Yes' : 'No'}</p>
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
