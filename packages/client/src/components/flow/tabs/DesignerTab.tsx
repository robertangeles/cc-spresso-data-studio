import { useState, useRef, useCallback } from 'react';
import type { FlowStep, FlowField, Skill, SkillConfig, EditorConfig } from '@cc/shared';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { useSkills } from '../../../hooks/useSkills';
import { useConfiguredModels } from '../../../hooks/useConfiguredModels';
import { ModelSelector } from '../../ui/ModelSelector';

interface DesignerTabProps {
  steps: FlowStep[];
  fields: FlowField[];
  onStepsChange: (steps: FlowStep[]) => void;
}

export function DesignerTab({ steps, fields, onStepsChange }: DesignerTabProps) {
  const [localSteps, setLocalSteps] = useState<FlowStep[]>(steps);
  const [showPicker, setShowPicker] = useState(false);
  const { skills } = useSkills();
  const { models } = useConfiguredModels();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const debouncedSave = useCallback(
    (updated: FlowStep[]) => {
      setLocalSteps(updated);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onStepsChange(updated), 400);
    },
    [onStepsChange],
  );

  const addStep = (skill: Skill) => {
    const config = skill.config as SkillConfig;
    const newStep: FlowStep = {
      id: crypto.randomUUID(),
      skillId: skill.id,
      skillVersion: skill.version,
      provider: config.defaultProvider ?? '',
      model: config.defaultModel ?? models[0]?.model ?? '',
      prompt: config.promptTemplate,
      capabilities: config.capabilities ?? [],
      inputMappings: {},
      order: localSteps.length,
    };
    debouncedSave([...localSteps, newStep]);
    setShowPicker(false);
  };

  const updateStep = (index: number, updates: Partial<FlowStep>) => {
    const updated = localSteps.map((s, i) => (i === index ? { ...s, ...updates } : s));
    debouncedSave(updated);
  };

  const removeStep = (index: number) => {
    debouncedSave(localSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= localSteps.length) return;
    const updated = [...localSteps];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    debouncedSave(updated.map((s, i) => ({ ...s, order: i })));
  };

  const getSkillForStep = (step: FlowStep): Skill | undefined => {
    return skills.find((s) => s.id === step.skillId);
  };

  // Available sources for input mapping
  const getInputSources = (stepIndex: number) => {
    const sources: Array<{ value: string; label: string }> = [];
    // Flow fields
    fields.forEach((f) => {
      sources.push({ value: f.id, label: `Field: ${f.label || f.id}` });
    });
    // Previous step outputs
    localSteps.slice(0, stepIndex).forEach((s, i) => {
      const skill = getSkillForStep(s);
      const config = skill?.config as SkillConfig | undefined;
      (config?.outputs ?? []).forEach((out) => {
        sources.push({
          value: `step_${s.id}.${out.key}`,
          label: `Step ${i + 1}: ${out.label} ({{${out.key}}})`,
        });
      });
    });
    return sources;
  };

  if (showPicker) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-text-primary">Select a Skill</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowPicker(false)}>
            Cancel
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {skills.map((skill) => (
            <Card key={skill.id} padding="md">
              <button type="button" onClick={() => addStep(skill)} className="w-full text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{skill.icon || '⚡'}</span>
                  <div>
                    <p className="font-medium text-text-primary">{skill.name}</p>
                    <p className="text-xs text-text-tertiary line-clamp-1">{skill.description}</p>
                  </div>
                </div>
              </button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-text-primary">Pipeline Steps</h3>
          <p className="text-sm text-text-secondary">Chain skills together to process content.</p>
        </div>
        <Button size="sm" onClick={() => setShowPicker(true)}>
          + Add Step
        </Button>
      </div>

      {localSteps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-default py-8 text-center">
          <p className="text-text-secondary">
            No steps yet. Click &quot;Add Step&quot; to pick a skill.
          </p>
        </div>
      ) : (
        localSteps.map((step, index) => {
          const skill = getSkillForStep(step);
          const config = skill?.config as SkillConfig | undefined;
          const sources = getInputSources(index);

          return (
            <Card key={step.id} padding="md">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-dim text-xs font-bold text-accent">
                      {index + 1}
                    </span>
                    <span className="text-lg">{skill?.icon || '⚡'}</span>
                    <span className="text-base font-semibold text-text-primary">
                      {skill?.name || 'Unknown Skill'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      className="rounded p-1 text-text-tertiary hover:bg-surface-3 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === localSteps.length - 1}
                      className="rounded p-1 text-text-tertiary hover:bg-surface-3 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      className="rounded p-1 text-red-400 hover:bg-red-400/10"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Model selector */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    Model
                  </label>
                  <ModelSelector
                    value={step.model}
                    onChange={(model) => updateStep(index, { model })}
                  />
                </div>

                {/* Input mappings */}
                {config?.inputs && config.inputs.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">
                      Input Mappings
                    </label>
                    <div className="space-y-1">
                      {config.inputs.map((input) => (
                        <div key={input.key} className="flex items-center gap-2 text-sm">
                          <span className="w-24 shrink-0 truncate text-xs font-mono text-text-secondary">
                            {input.key}
                          </span>
                          <span className="text-text-tertiary">←</span>
                          <select
                            value={step.inputMappings?.[input.key] ?? ''}
                            onChange={(e) =>
                              updateStep(index, {
                                inputMappings: {
                                  ...step.inputMappings,
                                  [input.key]: e.target.value,
                                },
                              })
                            }
                            className="flex-1 rounded border border-border-default bg-surface-2 px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                          >
                            <option value="">Auto / Default</option>
                            {sources.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Editor config */}
                <div className="border-t border-border-default pt-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                    <input
                      type="checkbox"
                      checked={step.editor?.enabled ?? false}
                      onChange={(e) => {
                        const editor: EditorConfig = step.editor ?? {
                          enabled: false,
                          model: '',
                          systemPrompt:
                            'You are a strict content editor. Check for clarity, accuracy, and engagement.',
                          maxRounds: 3,
                          approvalMode: 'auto',
                        };
                        updateStep(index, { editor: { ...editor, enabled: e.target.checked } });
                      }}
                      className="rounded border-border-default"
                    />
                    Enable Editor (AI critique loop)
                  </label>

                  {step.editor?.enabled && (
                    <div className="mt-2 space-y-2 rounded-lg border border-border-default bg-surface-2 p-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Editor Model
                        </label>
                        <ModelSelector
                          value={step.editor.model}
                          onChange={(model) =>
                            updateStep(index, { editor: { ...step.editor!, model } })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Editor Persona
                        </label>
                        <textarea
                          value={step.editor.systemPrompt}
                          onChange={(e) =>
                            updateStep(index, {
                              editor: { ...step.editor!, systemPrompt: e.target.value },
                            })
                          }
                          placeholder="Describe the editor's role and criteria..."
                          rows={6}
                          className="w-full rounded-lg border border-border-default bg-surface-3 px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-text-secondary">
                            Max Rounds
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={10}
                            value={step.editor.maxRounds}
                            onChange={(e) =>
                              updateStep(index, {
                                editor: { ...step.editor!, maxRounds: parseInt(e.target.value) },
                              })
                            }
                            className="w-full"
                          />
                          <div className="flex justify-between text-[10px] text-text-tertiary">
                            <span>1</span>
                            <span>{step.editor.maxRounds}</span>
                            <span>10</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-text-secondary">
                            Approval
                          </label>
                          <select
                            value={step.editor.approvalMode}
                            onChange={(e) =>
                              updateStep(index, {
                                editor: {
                                  ...step.editor!,
                                  approvalMode: e.target.value as 'auto' | 'manual',
                                },
                              })
                            }
                            className="w-full rounded border border-border-default bg-surface-3 px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                          >
                            <option value="auto">Auto (editor decides)</option>
                            <option value="manual">Manual (you approve)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}

      <p className="text-xs text-text-tertiary">
        {localSteps.length} step{localSteps.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
