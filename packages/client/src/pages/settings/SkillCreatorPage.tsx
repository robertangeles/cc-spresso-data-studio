import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SkillConfig, SkillInput, SkillOutput } from '@cc/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { getCategoryIcon } from '../../components/skills/SkillIcon';
import { Input } from '../../components/ui/Input';
import { ModelSelector } from '../../components/ui/ModelSelector';
import { api } from '../../lib/api';

const STEPS = [
  {
    id: 'basics',
    label: '1. Basics',
    guide:
      "Give your skill a name and describe what it does. The slug is auto-generated and used as a unique identifier. Choose a category that best describes the skill's purpose.\n\nTip: A good description helps users find and understand the skill. Be specific about what it does and when to use it.",
  },
  {
    id: 'inputs',
    label: '2. Inputs',
    guide:
      'Define the variables your skill needs from the user. Each input becomes a {{variable}} you can use in your prompt template.\n\nCommon inputs:\n- "content" (multiline) — the source text to process\n- "topic" (text) — the subject to focus on\n- "tone" (select) — the writing style\n- "audience" (text) — who the content is for\n\nMark inputs as "required" if the skill can\'t work without them.',
  },
  {
    id: 'prompt',
    label: '3. Prompt',
    guide:
      'This is the core of your skill — the instructions sent to the AI. Use {{variable_name}} to insert input values.\n\nBest practices:\n- Start with a clear role or context\n- Be specific about the output format you want\n- Include examples when possible\n- Use numbered steps for multi-part outputs\n- Set constraints (word count, tone, format)\n\nClick the variable chips below to insert them at your cursor position.',
  },
  {
    id: 'system',
    label: '4. System Prompt',
    guide:
      'The system prompt sets the AI\'s role and personality. It\'s sent before the main prompt and shapes how the AI responds.\n\nExamples:\n- "You are a social media strategist specializing in content repurposing."\n- "You are a technical writer who explains complex topics clearly."\n- "You are a copywriter focused on conversion and engagement."\n\nKeep it concise — 1-2 sentences is usually enough.',
  },
  {
    id: 'outputs',
    label: '5. Outputs',
    guide:
      'Define what your skill produces. Each output gets a key that other skills can reference when chaining in an orchestration.\n\nFor most skills, a single output named "result" with type "markdown" works well. Use multiple outputs when the skill produces distinct pieces (e.g., "subject_line" and "email_body").',
  },
  {
    id: 'config',
    label: '6. Config',
    guide:
      'Fine-tune the AI behavior:\n\nTemperature (0-2):\n- 0.3-0.5: Factual, consistent output\n- 0.7: Balanced creativity\n- 0.9-1.2: More creative, varied output\n\nMax Tokens: Maximum length of the response. 1000 tokens is roughly 750 words.\n\nDefault Model: Which AI model to use. Claude Sonnet 4.6 is a great default.',
  },
  {
    id: 'review',
    label: '7. Review & Save',
    guide:
      'Review your skill configuration. Once saved, it will appear in the Skills catalog and can be used in orchestrations.\n\nYou can always edit the skill later from the catalog.',
  },
];

const CATEGORIES = [
  { value: 'repurpose', label: 'Repurpose' },
  { value: 'generate', label: 'Generate' },
  { value: 'research', label: 'Research' },
  { value: 'transform', label: 'Transform' },
  { value: 'extract', label: 'Extract' },
  { value: 'plan', label: 'Plan' },
];

const INPUT_TYPES = ['text', 'multiline', 'select', 'document', 'image'] as const;
const OUTPUT_TYPES = ['text', 'markdown', 'json', 'image_url'] as const;

export function SkillCreatorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [guideOpen, setGuideOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSkill, setIsLoadingSkill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changelog, setChangelog] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('generate');
  const [icon, setIcon] = useState('\u2728');
  const [inputs, setInputs] = useState<SkillInput[]>([]);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [outputs, setOutputs] = useState<SkillOutput[]>([
    { key: 'result', type: 'markdown', label: 'Result' },
  ]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4000);
  const [defaultModel, setDefaultModel] = useState('');

  // Load existing skill in edit mode
  useEffect(() => {
    if (!id) return;
    setIsLoadingSkill(true);
    api
      .get(`/skills/${id}`)
      .then(({ data }) => {
        const skill = data.data;
        const cfg = skill.config as SkillConfig;
        setName(skill.name);
        setSlug(skill.slug);
        setDescription(skill.description);
        setCategory(skill.category);
        setIcon(skill.icon ?? '\u2728');
        setInputs(cfg.inputs ?? []);
        setPromptTemplate(cfg.promptTemplate ?? '');
        setSystemPrompt(cfg.systemPrompt ?? '');
        setOutputs(cfg.outputs ?? [{ key: 'result', type: 'markdown', label: 'Result' }]);
        setTemperature(cfg.temperature ?? 0.7);
        setMaxTokens(cfg.maxTokens ?? 4000);
        setDefaultModel(cfg.defaultModel ?? '');
      })
      .catch(() => setError('Failed to load skill'))
      .finally(() => setIsLoadingSkill(false));
  }, [id]);

  const autoSlug = (value: string) => {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    );
  };

  const insertVariable = (key: string) => {
    const textarea = promptRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = promptTemplate;
    const insertion = `{{${key}}}`;
    setPromptTemplate(text.substring(0, start) + insertion + text.substring(end));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  const addInput = () => {
    setInputs([
      ...inputs,
      {
        id: crypto.randomUUID(),
        key: '',
        type: 'text',
        label: '',
        required: false,
      },
    ]);
  };

  const updateInput = (index: number, updates: Partial<SkillInput>) => {
    setInputs(inputs.map((inp, i) => (i === index ? { ...inp, ...updates } : inp)));
  };

  const removeInput = (index: number) => {
    setInputs(inputs.filter((_, i) => i !== index));
  };

  const addOutput = () => {
    setOutputs([...outputs, { key: '', type: 'markdown', label: '' }]);
  };

  const updateOutput = (index: number, updates: Partial<SkillOutput>) => {
    setOutputs(outputs.map((out, i) => (i === index ? { ...out, ...updates } : out)));
  };

  const removeOutput = (index: number) => {
    setOutputs(outputs.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const config: SkillConfig = {
        inputs,
        outputs,
        promptTemplate,
        systemPrompt: systemPrompt || undefined,
        capabilities: [],
        defaultModel: defaultModel || undefined,
        temperature,
        maxTokens,
      };

      if (isEditMode) {
        await api.put(`/skills/${id}`, {
          name,
          description,
          category,
          icon,
          tags: [],
          config,
          changelog: changelog || undefined,
        });
      } else {
        await api.post('/skills', {
          name,
          slug,
          description,
          category,
          icon,
          tags: [],
          config,
        });
      }

      navigate('/skills');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Failed to save skill');
      } else {
        setError('Failed to save skill');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const step = STEPS[currentStep];

  if (isLoadingSkill) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">
            {isEditMode ? `Edit Skill: ${name || '...'}` : 'Create Skill'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(!guideOpen)}
              className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-3"
            >
              {guideOpen ? 'Hide Guide' : 'Show Guide'}
            </button>
          </div>
        </div>

        {/* Step navigation */}
        <div className="flex gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setCurrentStep(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                i === currentStep
                  ? 'bg-accent-dim text-accent'
                  : i < currentStep
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-surface-3 text-text-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step content */}
        <Card padding="lg">
          {step.id === 'basics' && (
            <div className="space-y-4">
              <Input
                label="Skill Name"
                value={name}
                onChange={(e) => autoSlug(e.target.value)}
                placeholder="e.g., Blog Post to LinkedIn"
              />
              <Input
                label="Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="blog-post-to-linkedin"
                disabled={isEditMode}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this skill does and when to use it..."
                  rows={3}
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const CatIcon = getCategoryIcon(cat.value);
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => {
                          setCategory(cat.value);
                          setIcon(cat.value);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${category === cat.value ? 'bg-accent-dim text-accent ring-2 ring-accent' : 'bg-surface-3 text-text-secondary hover:bg-surface-4'}`}
                      >
                        <CatIcon className="h-4 w-4" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step.id === 'inputs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  Define what information your skill needs.
                </p>
                <Button size="sm" onClick={addInput}>
                  + Add Input
                </Button>
              </div>
              {inputs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-default py-6 text-center text-sm text-text-tertiary">
                  {'No inputs yet. Add one to create a {{variable}} for your prompt.'}
                </div>
              ) : (
                inputs.map((inp, i) => (
                  <div
                    key={inp.id}
                    className="rounded-lg border border-border-default p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-tertiary">Input {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeInput(i)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        label="Key"
                        value={inp.key}
                        onChange={(e) =>
                          updateInput(i, { key: e.target.value.replace(/[^a-z0-9_]/g, '') })
                        }
                        placeholder="variable_name"
                      />
                      <Input
                        label="Label"
                        value={inp.label}
                        onChange={(e) => updateInput(i, { label: e.target.value })}
                        placeholder="Display label"
                      />
                      <div>
                        <label className="mb-1 block text-sm font-medium text-text-secondary">
                          Type
                        </label>
                        <select
                          value={inp.type}
                          onChange={(e) =>
                            updateInput(i, { type: e.target.value as SkillInput['type'] })
                          }
                          className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                        >
                          {INPUT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {inp.type === 'select' && (
                      <SkillSelectOptions
                        options={inp.options ?? []}
                        onChange={(options) => updateInput(i, { options })}
                      />
                    )}
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={inp.required}
                          onChange={(e) => updateInput(i, { required: e.target.checked })}
                          className="rounded border-border-default"
                        />
                        Required
                      </label>
                      {inp.defaultValue !== undefined && (
                        <Input
                          label="Default"
                          value={inp.defaultValue ?? ''}
                          onChange={(e) => updateInput(i, { defaultValue: e.target.value })}
                          placeholder="Default value"
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {step.id === 'prompt' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Write the instructions sent to the AI. Use variables from your inputs.
              </p>
              {inputs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {inputs
                    .filter((i) => i.key)
                    .map((inp) => (
                      <button
                        key={inp.key}
                        type="button"
                        onClick={() => insertVariable(inp.key)}
                        className="rounded-full bg-accent-dim px-2 py-1 text-xs font-mono text-accent hover:bg-accent-dim/80 transition-colors"
                      >
                        {'{{' + inp.key + '}}'}
                      </button>
                    ))}
                </div>
              )}
              <textarea
                ref={promptRef}
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                placeholder="Write your prompt template here. Use {{variable_name}} for dynamic content..."
                rows={14}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
              />
            </div>
          )}

          {step.id === 'system' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Set the AI&apos;s role and personality (optional but recommended).
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder='e.g., "You are a social media strategist specializing in content repurposing. You create engaging posts that drive conversation."'
                rows={4}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
              />
            </div>
          )}

          {step.id === 'outputs' && (
            <OutputsStep
              outputs={outputs}
              addOutput={addOutput}
              updateOutput={updateOutput}
              removeOutput={removeOutput}
            />
          )}

          {step.id === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">
                  Temperature: {temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-text-tertiary">
                  <span>Precise (0)</span>
                  <span>Balanced (0.7)</span>
                  <span>Creative (2)</span>
                </div>
              </div>
              <Input
                label="Max Tokens"
                type="number"
                value={String(maxTokens)}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4000)}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">
                  Default Model
                </label>
                <ModelSelector value={defaultModel} onChange={setDefaultModel} allowAuto />
              </div>
            </div>
          )}

          {step.id === 'review' && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-text-secondary">Name:</span>{' '}
                  <span className="font-medium">{name || '\u2014'}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Slug:</span>{' '}
                  <span className="font-mono">{slug || '\u2014'}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Category:</span>{' '}
                  <span className="font-medium">
                    {icon} {category}
                  </span>
                </div>
                <div>
                  <span className="text-text-secondary">Inputs:</span>{' '}
                  <span className="font-medium">{inputs.length}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Outputs:</span>{' '}
                  <span className="font-medium">{outputs.length}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Temperature:</span>{' '}
                  <span className="font-medium">{temperature}</span>
                </div>
              </div>
              {description && (
                <div>
                  <span className="text-text-secondary">Description:</span>
                  <p className="mt-1">{description}</p>
                </div>
              )}
              {promptTemplate && (
                <div>
                  <span className="text-text-secondary">Prompt Template:</span>
                  <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-surface-3 p-2 text-xs whitespace-pre-wrap">
                    {promptTemplate}
                  </pre>
                </div>
              )}
              {isEditMode && (
                <div className="mt-4 border-t border-border-default pt-4">
                  <label className="mb-1 block text-sm font-medium text-text-secondary">
                    Changelog (optional)
                  </label>
                  <input
                    type="text"
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder="What changed in this version?"
                    className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          {currentStep < STEPS.length - 1 ? (
            <Button onClick={() => setCurrentStep(currentStep + 1)}>Next</Button>
          ) : (
            <Button onClick={handleSave} disabled={isSaving || !name || !slug || !promptTemplate}>
              {isSaving ? 'Saving...' : isEditMode ? 'Update Skill' : 'Save Skill'}
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Guide Panel */}
      {guideOpen && (
        <aside className="w-72 shrink-0">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-text-primary">Guide</h4>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="text-text-tertiary hover:text-text-secondary text-xs"
              >
                Close
              </button>
            </div>
            <div className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">
              {step.guide}
            </div>
          </Card>
        </aside>
      )}
    </div>
  );
}

function OutputsStep({
  outputs,
  addOutput,
  updateOutput,
  removeOutput,
}: {
  outputs: SkillOutput[];
  addOutput: () => void;
  updateOutput: (i: number, u: Partial<SkillOutput>) => void;
  removeOutput: (i: number) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!showAdvanced) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
          <p className="text-sm text-green-400">
            Your skill will output a single result as markdown. This works for most skills.
          </p>
          <p className="mt-1 text-xs text-green-400/70">
            The output will be displayed in the execution results and saved to your Content Library.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(true)}
          className="text-xs text-accent hover:text-accent-hover font-medium"
        >
          Advanced: multiple outputs, visibility controls
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">Define what your skill produces.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(false)}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            Simple mode
          </button>
          <Button size="sm" onClick={addOutput}>
            + Add Output
          </Button>
        </div>
      </div>
      {outputs.map((out, i) => (
        <div key={i} className="rounded-lg border border-border-default p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">Output {i + 1}</span>
            {outputs.length > 1 && (
              <button
                type="button"
                onClick={() => removeOutput(i)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Key"
              value={out.key}
              onChange={(e) => updateOutput(i, { key: e.target.value.replace(/[^a-z0-9_]/g, '') })}
              placeholder="output_key"
            />
            <Input
              label="Label"
              value={out.label}
              onChange={(e) => updateOutput(i, { label: e.target.value })}
              placeholder="Display label"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Type</label>
              <select
                value={out.type}
                onChange={(e) => updateOutput(i, { type: e.target.value as SkillOutput['type'] })}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                {OUTPUT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={out.visible !== false}
              onChange={(e) => updateOutput(i, { visible: e.target.checked })}
              className="rounded border-border-default"
            />
            Show in results
          </label>
        </div>
      ))}
    </div>
  );
}

function SkillSelectOptions({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const [raw, setRaw] = useState(options.join('; '));

  const handleBlur = () => {
    onChange(
      raw
        .split(';')
        .map((o) => o.trim())
        .filter(Boolean),
    );
  };

  return (
    <Input
      label="Options (semicolon-separated)"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={handleBlur}
      placeholder="Option 1; Option 2; Option 3"
    />
  );
}
