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
          <div className="rounded-xl bg-brand-50 p-3">
            <SkillIcon category={skill.category} className="h-7 w-7 text-brand-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{skill.name}</h3>
            <p className="text-sm text-gray-500">{skill.description}</p>
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
        <h4 className="mb-2 font-medium text-gray-900">Inputs</h4>
        {config.inputs.length > 0 ? (
          <div className="space-y-2">
            {config.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-3 text-sm">
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{input.key}</span>
                <span className="text-gray-700">{input.label}</span>
                <span className="text-gray-400">({input.type})</span>
                {input.required && <span className="text-xs text-red-500">required</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No inputs defined</p>
        )}
      </Card>

      <Card padding="md">
        <h4 className="mb-2 font-medium text-gray-900">Outputs</h4>
        {config.outputs.length > 0 ? (
          <div className="space-y-2">
            {config.outputs.map((output) => (
              <div key={output.key} className="flex items-center gap-3 text-sm">
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{output.key}</span>
                <span className="text-gray-700">{output.label}</span>
                <span className="text-gray-400">({output.type})</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No outputs defined</p>
        )}
      </Card>

      <Card padding="md">
        <h4 className="mb-2 font-medium text-gray-900">Prompt Template</h4>
        <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
          {config.promptTemplate}
        </pre>
      </Card>

      {config.systemPrompt && (
        <Card padding="md">
          <h4 className="mb-2 font-medium text-gray-900">System Prompt</h4>
          <pre className="max-h-32 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
            {config.systemPrompt}
          </pre>
        </Card>
      )}

      <Card padding="md">
        <h4 className="mb-2 font-medium text-gray-900">Configuration</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500">Category</p>
            <p className="font-medium">{skill.category}</p>
          </div>
          <div>
            <p className="text-gray-500">Version</p>
            <p className="font-medium">{skill.version}</p>
          </div>
          <div>
            <p className="text-gray-500">Source</p>
            <p className="font-medium">{skill.source}</p>
          </div>
          <div>
            <p className="text-gray-500">Published</p>
            <p className="font-medium">{skill.isPublished ? 'Yes' : 'No'}</p>
          </div>
          {config.temperature !== undefined && (
            <div>
              <p className="text-gray-500">Temperature</p>
              <p className="font-medium">{config.temperature}</p>
            </div>
          )}
          {config.maxTokens !== undefined && (
            <div>
              <p className="text-gray-500">Max Tokens</p>
              <p className="font-medium">{config.maxTokens}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
