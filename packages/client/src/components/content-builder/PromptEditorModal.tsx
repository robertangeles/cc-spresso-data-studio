import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';
import {
  X,
  Sparkles,
  Loader2,
  Check,
  ArrowLeft,
  RefreshCw,
  Save,
  PenTool,
  Wand2,
} from 'lucide-react';
import { api } from '../../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    body: string;
    category: string;
    defaultModel: string;
  }) => void;
  editPrompt?: {
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  } | null;
}

interface ApexResult {
  suggestedName: string;
  generatedPrompt: string;
  framework: string;
  complexity: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { value: 'content', label: 'Content' },
  { value: 'social', label: 'Social' },
  { value: 'email', label: 'Email' },
  { value: 'custom', label: 'Custom' },
];

// APEX-suitable models: cheap + fast (for prompt generation)
const APEX_MODEL_IDS = [
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5-mini',
  'mistralai/mistral-small-2603',
];

const CONSTRAINT_OPTIONS = [
  'Time/Deadline',
  'Word Count/Length Limit',
  'Budget Considerations',
  'Technical Limitations',
  'Regulatory/Compliance',
  'Brand/Style Guidelines',
  'None',
];

const OUTPUT_FORMATS = [
  'Report',
  'Bullet Points',
  'Email',
  'Presentation',
  'Conversational',
  'Table',
  'Creative Writing',
  'Step-by-Step',
  'Q&A',
];

const TARGET_AUDIENCES = [
  'General Public',
  'Technical Experts',
  'Business Executives',
  'Students',
  'Internal Team',
  'External Clients',
  'Youth',
];

/* ------------------------------------------------------------------ */
/*  Shared input class                                                 */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full bg-surface-3 border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors placeholder:text-text-tertiary';

const selectCls = `${inputCls} appearance-none cursor-pointer`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PromptEditorModal({ isOpen, onClose, onSave, editPrompt }: PromptEditorModalProps) {
  const { models: configuredModels } = useConfiguredModels();

  // All configured models for the Manual tab model selector
  const allModels = useMemo(
    () => configuredModels.map((m) => ({ value: m.model, label: m.displayName })),
    [configuredModels],
  );

  // Cheap/fast models for APEX generation
  const apexModels = useMemo(() => {
    const filtered = configuredModels.filter((m) => APEX_MODEL_IDS.includes(m.model));
    return filtered.length > 0
      ? filtered.map((m) => ({ value: m.model, label: m.displayName }))
      : [{ value: 'anthropic/claude-haiku-4-5', label: 'Haiku 4.5' }]; // fallback
  }, [configuredModels]);

  /* ---- tabs & apex lifecycle ---- */
  const [activeTab, setActiveTab] = useState<'manual' | 'apex'>('manual');
  const [apexState, setApexState] = useState<'form' | 'loading' | 'review'>('form');

  /* ---- manual form ---- */
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('custom');
  const [defaultModel, setDefaultModel] = useState('anthropic/claude-sonnet-4-6');

  /* ---- APEX form ---- */
  const [persona, setPersona] = useState('');
  const [useCase, setUseCase] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);
  const [outputFormat, setOutputFormat] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [apexModel, setApexModel] = useState('anthropic/claude-haiku-4-5');

  /* ---- APEX result ---- */
  const [apexResult, setApexResult] = useState<ApexResult | null>(null);
  const [error, setError] = useState('');

  /* ---- pre-fill for edit mode ---- */
  useEffect(() => {
    if (editPrompt) {
      setName(editPrompt.name);
      setDescription(editPrompt.description ?? '');
      setBody(editPrompt.body);
      setCategory(editPrompt.category);
      setDefaultModel(editPrompt.defaultModel ?? 'anthropic/claude-sonnet-4-6');
      setActiveTab('manual');
    } else {
      resetAll();
    }
  }, [editPrompt, isOpen]);

  /* ---- helpers ---- */
  function resetAll() {
    setName('');
    setDescription('');
    setBody('');
    setCategory('custom');
    setDefaultModel('anthropic/claude-sonnet-4-6');
    setPersona('');
    setUseCase('');
    setConstraints([]);
    setOutputFormat('');
    setTargetAudience('');
    setApexModel('anthropic/claude-haiku-4-5');
    setApexResult(null);
    setApexState('form');
    setError('');
    setActiveTab('manual');
  }

  const toggleConstraint = (c: string) => {
    if (c === 'None') {
      setConstraints((prev) => (prev.includes('None') ? [] : ['None']));
      return;
    }
    setConstraints((prev) => {
      const without = prev.filter((x) => x !== 'None');
      return without.includes(c) ? without.filter((x) => x !== c) : [...without, c];
    });
  };

  /* ---- APEX generate ---- */
  const handleGenerate = useCallback(async () => {
    setApexState('loading');
    setError('');
    try {
      const { data } = await api.post('/prompts/generate-apex', {
        persona,
        useCase,
        constraints,
        outputFormat,
        targetAudience,
        model: apexModel,
      });
      setApexResult(data.data);
      setApexState('review');
    } catch {
      setError('Failed to generate prompt. Please try again.');
      setApexState('form');
    }
  }, [persona, useCase, constraints, outputFormat, targetAudience, apexModel]);

  /* ---- save handlers ---- */
  const handleManualSave = () => {
    if (!name.trim() || !body.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      body: body.trim(),
      category,
      defaultModel,
    });
  };

  const handleApexSave = () => {
    if (!apexResult) return;
    onSave({
      name: apexResult.suggestedName.trim(),
      description: '',
      body: apexResult.generatedPrompt.trim(),
      category: 'custom',
      defaultModel: 'anthropic/claude-sonnet-4-6',
    });
  };

  const handleEditInManual = () => {
    if (!apexResult) return;
    setName(apexResult.suggestedName);
    setBody(apexResult.generatedPrompt);
    setActiveTab('manual');
  };

  /* ---- click-outside ---- */
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  /* ---- bail if not open ---- */
  if (!isOpen) return null;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div className="bg-surface-1 rounded-2xl border border-border-subtle shadow-dark-lg max-w-2xl w-full mx-auto mt-20 mb-10 max-h-[80vh] overflow-hidden flex flex-col animate-scale-in">
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <PenTool className="h-5 w-5 text-accent" />
            {editPrompt ? 'Edit Prompt' : 'Create Prompt'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ---- Tab Bar ---- */}
        <div className="flex border-b border-border-subtle px-6">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'manual'
                ? 'text-accent'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <PenTool className="h-3.5 w-3.5" />
              Manual
            </span>
            {activeTab === 'manual' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apex')}
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'apex' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              APEX Generator
            </span>
            {activeTab === 'apex' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        </div>

        {/* ---- Body ---- */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ============ Manual Tab ============ */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My awesome prompt..."
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this prompt does..."
                  className={inputCls}
                />
              </div>

              {/* Category + Model row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={selectCls}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
                      &#9662;
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Model
                  </label>
                  <div className="relative">
                    <select
                      value={defaultModel}
                      onChange={(e) => setDefaultModel(e.target.value)}
                      className={selectCls}
                    >
                      {allModels.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
                      &#9662;
                    </span>
                  </div>
                </div>
              </div>

              {/* Prompt Body */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Prompt Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your prompt here... Use {{variable}} for dynamic placeholders."
                  rows={10}
                  className={`${inputCls} min-h-[200px] font-mono resize-y`}
                />
              </div>
            </div>
          )}

          {/* ============ APEX Tab — Form ============ */}
          {activeTab === 'apex' && apexState === 'form' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center">
                <h3 className="text-base font-semibold text-text-primary flex items-center justify-center gap-2">
                  <Wand2 className="h-4.5 w-4.5 text-accent" />
                  APEX — Advanced Prompt Engineering eXpert
                </h3>
                <p className="text-xs text-text-tertiary mt-1">
                  Let AI craft the perfect prompt for you
                </p>
              </div>

              {/* 1. Persona */}
              <div className="border-l-2 border-accent/40 pl-4">
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  <span className="text-accent font-semibold mr-1.5">1.</span>
                  What is the Persona?
                </label>
                <input
                  type="text"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder="Data Engineer, Content Writer, Chef..."
                  className={inputCls}
                />
              </div>

              {/* 2. Use Case */}
              <div className="border-l-2 border-accent/40 pl-4">
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  <span className="text-accent font-semibold mr-1.5">2.</span>
                  What is the Use Case?
                </label>
                <textarea
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  placeholder="Analyze a restaurant's menu and recommend pricing..."
                  rows={3}
                  className={`${inputCls} resize-y`}
                />
              </div>

              {/* 3. Constraints */}
              <div className="border-l-2 border-accent/40 pl-4">
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  <span className="text-accent font-semibold mr-1.5">3.</span>
                  What are the Constraints?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CONSTRAINT_OPTIONS.map((c) => (
                    <label
                      key={c}
                      onClick={() => toggleConstraint(c)}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <span
                        className={`flex-shrink-0 h-4 w-4 rounded border transition-all flex items-center justify-center ${
                          constraints.includes(c)
                            ? 'bg-accent border-accent'
                            : 'bg-surface-3 border-border-subtle group-hover:border-text-tertiary'
                        }`}
                      >
                        {constraints.includes(c) && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                        {c}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 4. Output Format */}
              <div className="border-l-2 border-accent/40 pl-4">
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  <span className="text-accent font-semibold mr-1.5">4.</span>
                  What is the desired Output Format?
                </label>
                <div className="flex flex-wrap gap-2">
                  {OUTPUT_FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOutputFormat(f)}
                      className={`rounded-full px-3 py-1.5 text-sm border transition-all ${
                        outputFormat === f
                          ? 'bg-accent-dim border-accent text-accent'
                          : 'bg-surface-3 border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-tertiary'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Target Audience */}
              <div className="border-l-2 border-accent/40 pl-4">
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  <span className="text-accent font-semibold mr-1.5">5.</span>
                  Who is the Target Audience?
                </label>
                <div className="flex flex-wrap gap-2">
                  {TARGET_AUDIENCES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setTargetAudience(a)}
                      className={`rounded-full px-3 py-1.5 text-sm border transition-all ${
                        targetAudience === a
                          ? 'bg-accent-dim border-accent text-accent'
                          : 'bg-surface-3 border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-tertiary'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* APEX Model */}
              <div className="border-l-2 border-accent/40 pl-4">
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Model
                </label>
                <div className="relative max-w-[240px]">
                  <select
                    value={apexModel}
                    onChange={(e) => setApexModel(e.target.value)}
                    className={selectCls}
                  >
                    {apexModels.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
                    &#9662;
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ============ APEX Tab — Loading ============ */}
          {activeTab === 'apex' && apexState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
              <p className="text-sm text-text-secondary animate-pulse">
                APEX is crafting your prompt...
              </p>
            </div>
          )}

          {/* ============ APEX Tab — Review ============ */}
          {activeTab === 'apex' && apexState === 'review' && apexResult && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-green-500/20 text-green-400">
                  <Check className="h-4 w-4" />
                </span>
                <h3 className="text-base font-semibold text-text-primary">Prompt Generated!</h3>
              </div>

              {/* Meta pills */}
              <div className="flex gap-3">
                <span className="text-xs bg-surface-3 rounded-full px-3 py-1 text-text-secondary border border-border-subtle">
                  Framework:{' '}
                  <span className="text-text-primary font-medium">{apexResult.framework}</span>
                </span>
                <span className="text-xs bg-surface-3 rounded-full px-3 py-1 text-text-secondary border border-border-subtle">
                  Complexity:{' '}
                  <span className="text-text-primary font-medium">{apexResult.complexity}</span>
                </span>
              </div>

              {/* Editable name */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
                <input
                  type="text"
                  value={apexResult.suggestedName}
                  onChange={(e) => setApexResult({ ...apexResult, suggestedName: e.target.value })}
                  className={inputCls}
                />
              </div>

              {/* Generated prompt preview */}
              <div className="bg-surface-2 rounded-lg p-4 border border-accent/20 max-h-[300px] overflow-y-auto">
                <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono leading-relaxed">
                  {apexResult.generatedPrompt}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ---- Footer ---- */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle bg-surface-1">
          {/* Manual tab footer */}
          {activeTab === 'manual' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualSave}
                disabled={!name.trim() || !body.trim()}
                className="rounded-lg px-5 py-2 text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                Save Prompt
              </button>
            </>
          )}

          {/* APEX form footer */}
          {activeTab === 'apex' && apexState === 'form' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!persona.trim() || !useCase.trim()}
                className="rounded-lg px-5 py-2 text-sm font-medium bg-gradient-to-r from-accent to-amber-600 text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate Prompt
              </button>
            </>
          )}

          {/* APEX loading footer */}
          {activeTab === 'apex' && apexState === 'loading' && (
            <div className="w-full text-center text-xs text-text-tertiary">
              This may take a few seconds...
            </div>
          )}

          {/* APEX review footer */}
          {activeTab === 'apex' && apexState === 'review' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setApexState('form');
                  setApexResult(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEditInManual}
                  className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors flex items-center gap-1.5"
                >
                  <PenTool className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={handleApexSave}
                  className="rounded-lg px-5 py-2 text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-all flex items-center gap-2"
                >
                  <Save className="h-3.5 w-3.5" />
                  Use &amp; Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
