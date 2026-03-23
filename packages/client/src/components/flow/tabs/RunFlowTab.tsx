import { useState, useEffect, useRef, useCallback } from 'react';
import type { Flow, FlowField, SSEStepStart, SSEStepComplete, SSEStepError, SSEEditorRound, SSEEditorApprovalNeeded, SSEDone } from '@cc/shared';
import Markdown from 'react-markdown';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { api } from '../../../lib/api';

interface RunFlowTabProps {
  flow: Flow;
}

type StepState = 'pending' | 'running' | 'done' | 'error';

interface LiveStep {
  index: number;
  skillName: string;
  model: string;
  state: StepState;
  output?: Record<string, string>;
  duration?: number;
  tokens?: { input: number; output: number };
  error?: string;
  editorRounds?: EditorRoundData[];
  awaitingApproval?: { generatorOutput: string; editorFeedback: string; round: number };
}

interface EditorRoundData {
  round: number;
  maxRounds: number;
  verdict: 'approve' | 'revise';
  feedback: string;
  revisedOutput?: string;
}

interface HistoryEntry {
  id: string;
  status: string;
  totalDuration: number;
  createdAt: string;
}

export function RunFlowTab({ flow }: RunFlowTabProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const fields = flow.config.fields;
  const steps = flow.config.steps;

  // Fetch history
  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await api.get(`/flows/${flow.id}/executions`);
      setHistory(data.data ?? []);
    } catch {
      // Non-blocking
    }
  }, [flow.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reload history after a run completes
  useEffect(() => {
    if (isDone) fetchHistory();
  }, [isDone, fetchHistory]);

  const loadFromHistory = async (runId: string) => {
    try {
      const { data } = await api.get(`/flows/${flow.id}/executions/${runId}`);
      const run = data.data;
      setInputs(run.inputs as Record<string, string>);
      const results = run.stepResults as Array<{ stepIndex: number; skillName: string; model: string; output: Record<string, string>; duration: number; tokens: { input: number; output: number }; status: string; error?: string }>;
      setLiveSteps(results.map((r) => ({
        index: r.stepIndex,
        skillName: r.skillName,
        model: r.model,
        state: (r.status === 'success' ? 'done' : 'error') as StepState,
        output: r.output,
        duration: r.duration,
        tokens: r.tokens,
        error: r.error,
        editorRounds: [],
      })));
      setTotalDuration(run.totalDuration);
      setIsDone(true);
      setShowHistory(false);
    } catch {
      setError('Failed to load history entry');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Auto-scroll results panel
  useEffect(() => {
    if (resultsRef.current) {
      resultsRef.current.scrollTop = resultsRef.current.scrollHeight;
    }
  }, [liveSteps]);

  const handleRun = useCallback(async () => {
    setError(null);
    setLiveSteps([]);
    setIsDone(false);
    setTotalDuration(null);

    if (steps.length === 0) {
      setError('This orchestration has no steps. Add skills in the Designer tab first.');
      return;
    }

    // Validate required fields
    for (const field of fields) {
      if (field.required && !inputs[field.id]?.trim()) {
        setError(`Required field "${field.label}" is missing.`);
        return;
      }
    }

    setIsRunning(true);
    window.dispatchEvent(new CustomEvent('orchestration:start'));

    try {
      // B1: Get execution token
      const { data: tokenData } = await api.post(`/flows/${flow.id}/execute/token`, { inputs });
      const token = tokenData.data.token;

      // B2: Open SSE stream
      const baseUrl = '/api';
      const url = `${baseUrl}/flows/${flow.id}/execute/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('step_start', (e) => {
        const data: SSEStepStart = JSON.parse(e.data);
        setLiveSteps((prev) => [
          ...prev.filter((s) => s.index !== data.stepIndex),
          {
            index: data.stepIndex,
            skillName: data.skillName,
            model: data.model,
            state: 'running',
            editorRounds: [],
          },
        ]);
      });

      es.addEventListener('step_complete', (e) => {
        const data: SSEStepComplete = JSON.parse(e.data);
        setLiveSteps((prev) =>
          prev.map((s) =>
            s.index === data.stepIndex
              ? { ...s, state: 'done' as StepState, output: data.output, duration: data.duration, tokens: data.tokens, model: data.model }
              : s,
          ),
        );
      });

      es.addEventListener('step_error', (e) => {
        const data: SSEStepError = JSON.parse(e.data);
        setLiveSteps((prev) =>
          prev.map((s) =>
            s.index === data.stepIndex
              ? { ...s, state: 'error' as StepState, error: data.error }
              : s,
          ),
        );
      });

      es.addEventListener('editor_round', (e) => {
        const data: SSEEditorRound = JSON.parse(e.data);
        setLiveSteps((prev) =>
          prev.map((s) =>
            s.index === data.stepIndex
              ? { ...s, editorRounds: [...(s.editorRounds ?? []), data] }
              : s,
          ),
        );
      });

      es.addEventListener('editor_approval_needed', (e) => {
        const data: SSEEditorApprovalNeeded = JSON.parse(e.data);
        setLiveSteps((prev) =>
          prev.map((s) =>
            s.index === data.stepIndex
              ? { ...s, awaitingApproval: { generatorOutput: data.generatorOutput, editorFeedback: data.editorFeedback, round: data.round } }
              : s,
          ),
        );
      });

      es.addEventListener('done', (e) => {
        const data: SSEDone = JSON.parse(e.data);
        setTotalDuration(data.totalDuration);
        setIsDone(true);
        setIsRunning(false);
        window.dispatchEvent(new CustomEvent('orchestration:end'));
        es.close();
        eventSourceRef.current = null;
      });

      es.onerror = () => {
        if (!isDone) {
          setReconnecting(true);
          // Clear any pending approvals — stream is dead
          setLiveSteps((prev) =>
            prev.map((s) => s.awaitingApproval ? { ...s, awaitingApproval: undefined } : s),
          );
          setTimeout(() => {
            setReconnecting(false);
            // If still not done after reconnect window, mark as failed
            if (es.readyState === EventSource.CLOSED) {
              setIsRunning(false);
              setError('Connection to server lost. Results may be incomplete.');
              window.dispatchEvent(new CustomEvent('orchestration:end'));
            }
          }, 5000);
        }
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      if (axiosErr.response?.status === 503) {
        setError('No AI providers configured. Add an API key in Settings → AI Models.');
      } else {
        setError(axiosErr.response?.data?.error || 'Execution failed');
      }
      setIsRunning(false);
      window.dispatchEvent(new CustomEvent('orchestration:end'));
    }
  }, [flow.id, inputs, fields, steps, isDone]);

  const handleApproval = async (stepIndex: number, action: 'approve' | 'revise', feedback?: string) => {
    try {
      await api.post(`/flows/${flow.id}/execute/approve`, { stepIndex, action, feedback });
      setLiveSteps((prev) =>
        prev.map((s) =>
          s.index === stepIndex ? { ...s, awaitingApproval: undefined } : s,
        ),
      );
    } catch {
      setError('Failed to send approval — your session may have expired. Try logging in again.');
    }
  };

  const handleOutputEdit = (stepIndex: number, key: string, value: string) => {
    setLiveSteps((prev) =>
      prev.map((s) =>
        s.index === stepIndex
          ? { ...s, output: { ...s.output, [key]: value } }
          : s,
      ),
    );
  };

  const [refreshingStep, setRefreshingStep] = useState<number | null>(null);

  const handleStepRefresh = async (stepIndex: number) => {
    setRefreshingStep(stepIndex);
    try {
      // Build execution context: inputs + all previous step outputs
      const executionContext: Record<string, string> = { ...inputs };
      for (const s of liveSteps) {
        if (s.index < stepIndex && s.output) {
          const stepConfig = steps.sort((a, b) => a.order - b.order)[s.index];
          if (stepConfig) {
            for (const [key, value] of Object.entries(s.output)) {
              executionContext[`step_${stepConfig.id}.${key}`] = value;
            }
          }
        }
      }

      const { data } = await api.post(`/flows/${flow.id}/execute/step`, {
        stepIndex,
        executionContext,
      });

      const result = data.data;
      setLiveSteps((prev) =>
        prev.map((s) =>
          s.index === stepIndex
            ? {
                ...s,
                state: result.status === 'success' ? 'done' as StepState : 'error' as StepState,
                output: result.outputs,
                duration: result.durationMs,
                tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
                model: result.model,
                error: result.error,
                editorRounds: [],
              }
            : s,
        ),
      );
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Refresh failed';
      setLiveSteps((prev) =>
        prev.map((s) =>
          s.index === stepIndex ? { ...s, state: 'error' as StepState, error: msg } : s,
        ),
      );
    } finally {
      setRefreshingStep(null);
    }
  };

  const handleReset = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setLiveSteps([]);
    setIsDone(false);
    setTotalDuration(null);
    setIsRunning(false);
    window.dispatchEvent(new CustomEvent('orchestration:end'));
    setError(null);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-220px)]">
      {/* Left panel — Inputs */}
      <div className="w-1/3 shrink-0 space-y-4 overflow-y-auto">
        <div>
          <h3 className="font-medium text-gray-900">Run Orchestration</h3>
          <p className="text-sm text-gray-500">Fill in the inputs and execute.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {reconnecting && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Reconnecting...
          </div>
        )}

        <Card padding="lg">
          {fields.length === 0 ? (
            <p className="text-sm text-gray-500">No input fields configured. Add fields in the Form Builder tab.</p>
          ) : (
            <div className="space-y-3">
              {fields.map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={inputs[field.id] ?? ''}
                  onChange={(val) => setInputs({ ...inputs, [field.id]: val })}
                  disabled={isRunning}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="flex gap-2">
          <Button onClick={handleRun} disabled={isRunning}>
            {isRunning ? 'Running...' : 'Execute'}
          </Button>
          {(isDone || liveSteps.length > 0) && (
            <Button variant="ghost" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                <span>{showHistory ? '▾' : '▸'}</span>
                History ({history.length})
              </button>
              {showHistory && (
                <button
                  type="button"
                  onClick={() => setShowClearHistoryModal(true)}
                  className="text-[10px] text-red-500 hover:text-red-700"
                >
                  Clear All
                </button>
              )}
            </div>
            {showHistory && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                {history.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center gap-1 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    <button
                      type="button"
                      onClick={() => loadFromHistory(run.id)}
                      className="flex-1 flex items-center justify-between px-3 py-2 text-xs text-left"
                    >
                      <span className="text-gray-700">
                        {new Date(run.createdAt).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${
                        run.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {run.status}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.delete(`/flows/${flow.id}/executions/${run.id}`);
                        fetchHistory();
                      }}
                      className="px-2 py-2 text-gray-300 hover:text-red-500"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel — Live Results */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto space-y-3">
        {liveSteps.length === 0 && !isRunning && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Results will appear here as each step completes.</p>
          </div>
        )}

        {liveSteps.map((step) => (
          <LiveStepCard
            key={step.index}
            step={step}
            onApprove={(action, feedback) => handleApproval(step.index, action, feedback)}
            onOutputEdit={handleOutputEdit}
            onRefresh={handleStepRefresh}
            isRefreshing={refreshingStep === step.index}
          />
        ))}

        {isDone && totalDuration !== null && (() => {
          const hasErrors = liveSteps.some((s) => s.state === 'error');
          return (
          <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${hasErrors ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
            <span>{hasErrors ? 'Failed' : 'Completed'} in {(totalDuration / 1000).toFixed(1)}s</span>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Clear Output
            </button>
          </div>
          );
        })()}
      </div>

      <Modal
        isOpen={showClearHistoryModal}
        onClose={() => setShowClearHistoryModal(false)}
        title="Clear History"
        confirmLabel="Clear All"
        onConfirm={async () => {
          await api.delete(`/flows/${flow.id}/executions`);
          fetchHistory();
          setShowClearHistoryModal(false);
        }}
        variant="danger"
      >
        <p>Delete all execution history for this orchestration? This cannot be undone.</p>
      </Modal>
    </div>
  );
}

// --- Field Input ---

interface FieldInputProps {
  field: FlowField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function FieldInput({ field, value, onChange, disabled }: FieldInputProps) {
  const baseClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-50';

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {field.type === 'multiline' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          disabled={disabled}
          className={baseClass}
        />
      ) : field.type === 'dropdown' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={baseClass}
        >
          <option value="">Select...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={baseClass}
        />
      )}
    </div>
  );
}

// --- Live Step Card ---

interface LiveStepCardProps {
  step: LiveStep;
  onApprove: (action: 'approve' | 'revise', feedback?: string) => void;
  onOutputEdit?: (stepIndex: number, key: string, value: string) => void;
  onRefresh?: (stepIndex: number) => void;
  isRefreshing?: boolean;
}

const THINKING_MESSAGES = [
  // Content craft
  'Warming up the neurons...',
  'Consulting the muse...',
  'Brewing fresh ideas...',
  'Connecting the dots...',
  'Polishing the prose...',
  'Channeling creativity...',
  'Weaving the narrative...',
  'Sharpening the thesis...',
  'Distilling the essence...',
  'Crafting something special...',
  'Summoning the right words...',
  'Hunting for the perfect hook...',
  'Building momentum...',
  'Turning coffee into content...',
  'Calibrating the voice...',
  'Sculpting the argument...',
  'Finding the throughline...',
  'Chasing the aha moment...',
  'Forging the narrative arc...',
  'Painting with words...',
  'Curating the best angles...',
  'Marinating the concepts...',
  'Harmonizing the sections...',
  'Running the mental simulation...',
  'Almost there, stay with me...',
  // Wizarding world
  'Accio brilliant ideas...',
  'Lumos — illuminating insights...',
  'Expecto Patronum — summoning inspiration...',
  'Wingardium Leviosa — elevating the narrative...',
  'Alohomora — unlocking creativity...',
  'Revelio — uncovering hidden angles...',
  'Protego — shielding against weak arguments...',
  'Obliviate — clearing writer\'s block...',
  'Riddikulus — turning complexity into clarity...',
  'Expelliarmus — disarming cliches...',
  'Stupefy — stunning prose incoming...',
  'Finite Incantatem — finalizing the draft...',
  'Prior Incantato — reviewing previous work...',
  'Sonorus — amplifying your message...',
  'Nox — dimming the noise, finding focus...',
  'Reparo — fixing the rough edges...',
  'Aguamenti — flowing with fresh content...',
  'Confundo — rethinking the angle...',
  'Episkey — healing the weak spots...',
  'Geminio — multiplying content assets...',
  'Impervius — making the argument watertight...',
  'Muffliato — silencing distractions...',
  'Scourgify — cleaning up the draft...',
  'Aparecium — making the thesis visible...',
  'Felix Felicis — brewing liquid luck...',
];

function useThinkingMessage(isRunning: boolean) {
  const [messageIndex, setMessageIndex] = useState(() => Math.floor(Math.random() * THINKING_MESSAGES.length));

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning]);

  return THINKING_MESSAGES[messageIndex];
}

function LiveStepCard({ step, onApprove, onOutputEdit, onRefresh, isRefreshing }: LiveStepCardProps) {
  const [editFeedback, setEditFeedback] = useState('');
  const [viewMode, setViewMode] = useState<'raw' | 'preview' | 'edit'>('preview');
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({});
  const thinkingMessage = useThinkingMessage(step.state === 'running');

  const stateStyles: Record<StepState, string> = {
    pending: 'border-gray-200 bg-gray-50',
    running: 'border-brand-200 bg-brand-50',
    done: 'border-green-200 bg-white',
    error: 'border-red-200 bg-red-50',
  };

  const stateBadge: Record<StepState, { text: string; class: string }> = {
    pending: { text: 'Pending', class: 'bg-gray-100 text-gray-500' },
    running: { text: 'Running...', class: 'bg-brand-100 text-brand-700' },
    done: { text: 'Done', class: 'bg-green-100 text-green-700' },
    error: { text: 'Error', class: 'bg-red-100 text-red-700' },
  };

  const badge = stateBadge[step.state];

  return (
    <div className={`rounded-lg border p-4 transition-all ${stateStyles[step.state]}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {step.state === 'running' && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          )}
          <span className="font-medium text-gray-900">Step {step.index + 1}: {step.skillName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{step.model}</span>
          {(step.state === 'done' || step.state === 'error') && onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh(step.index)}
              disabled={isRefreshing}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshing ? 'Refreshing...' : 'Regenerate'}
            </button>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.class}`}>
            {badge.text}
          </span>
        </div>
      </div>

      {/* Thinking message */}
      {step.state === 'running' && (
        <p className="mb-2 text-sm text-brand-600 italic animate-pulse">{thinkingMessage}</p>
      )}

      {/* Metadata */}
      {step.state === 'done' && step.duration !== undefined && (
        <div className="mb-2 flex gap-4 text-xs text-gray-500">
          <span>{(step.duration / 1000).toFixed(1)}s</span>
          {step.tokens && (
            <span>{step.tokens.input + step.tokens.output} tokens</span>
          )}
        </div>
      )}

      {/* Error */}
      {step.state === 'error' && step.error && (
        <div className="text-sm text-red-700">{step.error}</div>
      )}

      {/* Output */}
      {step.output && Object.entries(step.output).filter(([key]) => !key.startsWith('__type_')).map(([key, value]) => {
        const outputType = step.output?.[`__type_${key}`];
        const isImage = outputType === 'image_url' || outputType === 'image_base64' || value?.startsWith('data:image/') || value?.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp|gif)/i);

        return (
        <div key={key} className="mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase">{key}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'preview' ? 'bg-brand-100 text-brand-700' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'raw' ? 'bg-brand-100 text-brand-700' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Raw
              </button>
              {step.state === 'done' && (
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'edit') {
                      setViewMode('preview');
                    } else {
                      setEditBuffer({ ...editBuffer, [key]: value });
                      setViewMode('edit');
                    }
                  }}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'edit' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {viewMode === 'edit' ? 'Cancel' : 'Edit'}
                </button>
              )}
            </div>
          </div>
          {isImage ? (
            <div className="mt-1">
              <img
                src={value}
                alt="Generated image"
                className="max-h-96 rounded-lg border border-gray-200"
              />
              <a href={value} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-brand-600 hover:text-brand-800">
                Open full size
              </a>
            </div>
          ) : viewMode === 'edit' ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={editBuffer[key] ?? value}
                onChange={(e) => setEditBuffer({ ...editBuffer, [key]: e.target.value })}
                rows={16}
                className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onOutputEdit?.(step.index, key, editBuffer[key] ?? value);
                    setViewMode('preview');
                  }}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : viewMode === 'raw' ? (
            <pre className="mt-1 max-h-96 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
              {value}
            </pre>
          ) : (
            <div className="mt-1 max-h-96 overflow-auto rounded-lg bg-white border border-gray-200 p-4 prose prose-sm prose-gray max-w-none">
              <Markdown>{value}</Markdown>
            </div>
          )}
        </div>
      );})}

      {/* Editor Rounds */}
      {step.editorRounds && step.editorRounds.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <h5 className="text-xs font-semibold text-gray-600 uppercase mb-2">Editor Review</h5>
          {step.editorRounds.map((round) => (
            <div key={round.round} className="mb-2 rounded-lg bg-gray-50 p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-700">Round {round.round}/{round.maxRounds}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${
                  round.verdict === 'approve' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {round.verdict === 'approve' ? 'Approved' : 'Revise'}
                </span>
              </div>
              <p className="text-gray-600">{round.feedback}</p>
            </div>
          ))}
        </div>
      )}

      {/* Manual Approval */}
      {step.awaitingApproval && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <h5 className="text-sm font-semibold text-amber-800 mb-2">Editor Feedback — Your Approval Needed</h5>
            <p className="text-sm text-gray-700 mb-3">{step.awaitingApproval.editorFeedback}</p>
            <textarea
              value={editFeedback}
              onChange={(e) => setEditFeedback(e.target.value)}
              placeholder="Optionally edit the feedback before sending..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onApprove('approve')}>
                Accept Output
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onApprove('revise', editFeedback || step.awaitingApproval!.editorFeedback)}>
                Send to Generator
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
