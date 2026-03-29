import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Flow,
  FlowField,
  SSEStepStart,
  SSEStepComplete,
  SSEStepError,
  SSEEditorRound,
  SSEEditorApprovalNeeded,
  SSEDone,
  AuditViolation,
} from '@cc/shared';
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
      const results = run.stepResults as Array<{
        stepIndex: number;
        skillName: string;
        model: string;
        output: Record<string, string>;
        duration: number;
        tokens: { input: number; output: number };
        status: string;
        error?: string;
      }>;
      setLiveSteps(
        results.map((r) => ({
          index: r.stepIndex,
          skillName: r.skillName,
          model: r.model,
          state: (r.status === 'success' ? 'done' : 'error') as StepState,
          output: r.output,
          duration: r.duration,
          tokens: r.tokens,
          error: r.error,
          editorRounds: [],
        })),
      );
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
              ? {
                  ...s,
                  state: 'done' as StepState,
                  output: data.output,
                  duration: data.duration,
                  tokens: data.tokens,
                  model: data.model,
                }
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
              ? {
                  ...s,
                  awaitingApproval: {
                    generatorOutput: data.generatorOutput,
                    editorFeedback: data.editorFeedback,
                    round: data.round,
                  },
                }
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
            prev.map((s) => (s.awaitingApproval ? { ...s, awaitingApproval: undefined } : s)),
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

  const handleApproval = async (
    stepIndex: number,
    action: 'approve' | 'revise',
    feedback?: string,
  ) => {
    try {
      await api.post(`/flows/${flow.id}/execute/approve`, { stepIndex, action, feedback });
      setLiveSteps((prev) =>
        prev.map((s) => (s.index === stepIndex ? { ...s, awaitingApproval: undefined } : s)),
      );
    } catch {
      setError('Failed to send approval — your session may have expired. Try logging in again.');
    }
  };

  const handleOutputEdit = (stepIndex: number, key: string, value: string) => {
    setLiveSteps((prev) =>
      prev.map((s) =>
        s.index === stepIndex ? { ...s, output: { ...s.output, [key]: value } } : s,
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
                state: result.status === 'success' ? ('done' as StepState) : ('error' as StepState),
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
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Refresh failed';
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
          <h3 className="font-medium text-text-primary">Run Orchestration</h3>
          <p className="text-sm text-text-tertiary">Fill in the inputs and execute.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {reconnecting && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
            Reconnecting...
          </div>
        )}

        <Card padding="lg">
          {fields.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              No input fields configured. Add fields in the Form Builder tab.
            </p>
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
                className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-secondary"
              >
                <span>{showHistory ? '▾' : '▸'}</span>
                History ({history.length})
              </button>
              {showHistory && (
                <button
                  type="button"
                  onClick={() => setShowClearHistoryModal(true)}
                  className="text-[10px] text-red-400 hover:text-red-300"
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
                    className="flex items-center gap-1 rounded-lg border border-border-subtle hover:bg-surface-2"
                  >
                    <button
                      type="button"
                      onClick={() => loadFromHistory(run.id)}
                      className="flex-1 flex items-center justify-between px-3 py-2 text-xs text-left"
                    >
                      <span className="text-text-secondary">
                        {new Date(run.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          run.status === 'completed'
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}
                      >
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
                      className="px-2 py-2 text-text-tertiary hover:text-red-400"
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
            <p className="text-sm text-text-tertiary">
              Results will appear here as each step completes.
            </p>
          </div>
        )}

        {liveSteps.map((step) => (
          <LiveStepCard
            key={step.index}
            step={step}
            flowId={flow.id}
            onApprove={(action, feedback) => handleApproval(step.index, action, feedback)}
            onOutputEdit={handleOutputEdit}
            onRefresh={handleStepRefresh}
            isRefreshing={refreshingStep === step.index}
          />
        ))}

        {isDone &&
          totalDuration !== null &&
          (() => {
            const hasErrors = liveSteps.some((s) => s.state === 'error');
            return (
              <div
                className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${hasErrors ? 'border-red-500/20 bg-red-500/10 text-red-400' : 'border-green-500/20 bg-green-500/10 text-green-400'}`}
              >
                <span>
                  {hasErrors ? 'Failed' : 'Completed'} in {(totalDuration / 1000).toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-medium text-text-tertiary hover:text-text-secondary"
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
  const baseClass =
    'w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:bg-surface-3 disabled:text-text-tertiary';

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">
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
            <option key={opt} value={opt}>
              {opt}
            </option>
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
  flowId: string;
  onApprove: (action: 'approve' | 'revise', feedback?: string) => void;
  onOutputEdit?: (stepIndex: number, key: string, value: string) => void;
  onRefresh?: (stepIndex: number) => void;
  isRefreshing?: boolean;
}

const THINKING_MESSAGES = [
  // Espresso shots
  'Pulling a fresh shot...',
  'Grinding the beans...',
  'Tamping down...',
  'Extracting the good stuff...',
  'Steaming the milk...',
  'Double shot incoming...',
  'No drip. Just flow.',
  'Dialing in the grind...',
  'Crema forming...',
  'Precise input. Concentrated output.',
  'One idea in. Twelve out.',
  'Heating the group head...',
  'Filtering the noise...',
  'Packing it tight...',
  'Almost ready. No rush. Actually, rush.',
  // Fast content
  'Writing faster than you think...',
  'Cutting the fluff...',
  'No filler. Just signal.',
  'Sharpening every word...',
  'Killing your darlings for you...',
  'Making it punch...',
  'Trimming the fat...',
  'Finding the hook...',
  'Nailing the angle...',
  'Building the argument...',
  'Connecting dots at speed...',
  'Locking the thesis...',
  'Sourcing the proof...',
  'Tightening the arc...',
  'Earning every sentence...',
  // Cheeky
  'Better than your last draft...',
  'Doing in seconds what took you hours...',
  'Your content hamster wheel stops here.',
  'No meetings required for this one.',
  'Skipping the committee review...',
  'This would take an agency three weeks.',
  'Already better than most LinkedIn posts.',
  'No "synergy" in this output. Promise.',
  'Faster than your coffee is cooling...',
  "Content that doesn't die in tabs.",
  // Momentum
  'Momentum loading...',
  'Zero to published...',
  'From blank page to done...',
  'The hard part is over. You showed up.',
  'Drop the idea. We handle the rest.',
  "One idea. Multiple channels. Let's go.",
  'Creating assets, not busywork.',
  "Your audience won't wait. Neither do we.",
  'Ship it before lunch.',
  'Almost there. Stay caffeinated.',
];

function useThinkingMessage(isRunning: boolean) {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length),
  );

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning]);

  return THINKING_MESSAGES[messageIndex];
}

function LiveStepCard({
  step,
  flowId,
  onApprove,
  onOutputEdit,
  onRefresh,
  isRefreshing,
}: LiveStepCardProps) {
  const [editFeedback, setEditFeedback] = useState('');
  const [viewMode, setViewMode] = useState<'raw' | 'preview' | 'edit' | 'audit'>('preview');
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({});
  const [auditResult, setAuditResult] = useState<{
    violations: AuditViolation[];
    mechanical: number;
    subjective: number;
    total: number;
  } | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isReworking, setIsReworking] = useState(false);
  const [reworkRounds, setReworkRounds] = useState<
    Array<{ round: number; fixedCount: number; remainingCount: number }>
  >([]);
  const thinkingMessage = useThinkingMessage(step.state === 'running');

  const getOutputText = () => {
    if (!step.output) return '';
    return Object.entries(step.output)
      .filter(([k]) => !k.startsWith('__type_'))
      .map(([, v]) => v)
      .join('\n\n');
  };

  const handleAudit = async (includeAi = true) => {
    setIsAuditing(true);
    setAuditResult(null);
    try {
      const { data } = await api.post(`/flows/${flowId}/audit`, {
        content: getOutputText(),
        includeAi,
      });
      setAuditResult(data.data);
      setViewMode('audit');
    } catch {
      setAuditResult({ violations: [], mechanical: 0, subjective: 0, total: -1 });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleAutoFix = async () => {
    setIsReworking(true);
    setReworkRounds([]);
    try {
      const { data } = await api.post(`/flows/${flowId}/rework`, {
        content: getOutputText(),
        model: step.model,
        maxRounds: 3,
      });
      const result = data.data;
      setReworkRounds(result.rounds);

      // Update the step output with the reworked content
      if (result.finalContent && onOutputEdit) {
        const outputKey = Object.keys(step.output ?? {}).find((k) => !k.startsWith('__type_'));
        if (outputKey) {
          onOutputEdit(step.index, outputKey, result.finalContent);
        }
      }

      // Re-audit the final content
      const auditRes = await api.post(`/flows/${flowId}/audit`, {
        content: result.finalContent,
        includeAi: false,
      });
      setAuditResult(auditRes.data.data);
    } catch {
      // keep current state
    } finally {
      setIsReworking(false);
    }
  };

  const stateStyles: Record<StepState, string> = {
    pending: 'border-border-subtle bg-surface-1',
    running: 'border-accent/30 bg-surface-1 shadow-[0_0_15px_rgba(255,214,10,0.05)]',
    done: 'border-green-500/20 bg-surface-1',
    error: 'border-red-500/20 bg-surface-1',
  };

  const stateBadge: Record<StepState, { text: string; class: string }> = {
    pending: { text: 'Pending', class: 'bg-surface-3 text-text-tertiary' },
    running: { text: 'Running...', class: 'bg-accent/15 text-accent' },
    done: { text: 'Done', class: 'bg-green-500/15 text-green-400' },
    error: { text: 'Error', class: 'bg-red-500/15 text-red-400' },
  };

  const badge = stateBadge[step.state];

  return (
    <div className={`rounded-lg border p-4 transition-all ${stateStyles[step.state]}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {step.state === 'running' && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-dim text-xs font-bold text-accent">
            {step.index + 1}
          </span>
          <span className="text-base font-semibold text-text-primary">{step.skillName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">{step.model}</span>
          {(step.state === 'done' || step.state === 'error') && onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh(step.index)}
              disabled={isRefreshing}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="mb-2 flex gap-4 text-xs text-text-tertiary">
          <span>{(step.duration / 1000).toFixed(1)}s</span>
          {step.tokens && <span>{step.tokens.input + step.tokens.output} tokens</span>}
        </div>
      )}

      {/* Error */}
      {step.state === 'error' && step.error && (
        <div className="text-sm text-red-400">{step.error}</div>
      )}

      {/* Output */}
      {step.output &&
        Object.entries(step.output)
          .filter(([key]) => !key.startsWith('__type_'))
          .map(([key, value]) => {
            const outputType = step.output?.[`__type_${key}`];
            const isImage =
              outputType === 'image_url' ||
              outputType === 'image_base64' ||
              value?.startsWith('data:image/') ||
              value?.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp|gif)/i);

            return (
              <div key={key} className="mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-tertiary uppercase">{key}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'preview' ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('raw')}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'raw' ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
                    >
                      Raw
                    </button>
                    {step.state === 'done' && (
                      <>
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
                          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'edit' ? 'bg-amber-400/15 text-amber-400' : 'text-text-tertiary hover:text-text-secondary'}`}
                        >
                          {viewMode === 'edit' ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (viewMode === 'audit') {
                              setViewMode('preview');
                            } else {
                              handleAudit(true);
                            }
                          }}
                          disabled={isAuditing}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === 'audit' ? 'bg-red-500/15 text-red-400' : 'text-text-tertiary hover:text-text-secondary'} disabled:opacity-50`}
                        >
                          {isAuditing
                            ? 'Auditing...'
                            : auditResult
                              ? `Audit (${auditResult.total})`
                              : 'Audit'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isImage ? (
                  <div className="mt-1">
                    <img
                      src={value}
                      alt="Generated image"
                      className="max-h-96 rounded-lg border border-border-subtle"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = value;
                        link.download = `content-pilot-image-${Date.now()}.jpg`;
                        link.click();
                      }}
                      className="mt-1 inline-block text-xs text-accent hover:text-accent-hover"
                    >
                      Download Image
                    </button>
                  </div>
                ) : viewMode === 'edit' ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      value={editBuffer[key] ?? value}
                      onChange={(e) => setEditBuffer({ ...editBuffer, [key]: e.target.value })}
                      rows={16}
                      className="w-full rounded-lg border border-amber-400/30 bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-accent/40 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onOutputEdit?.(step.index, key, editBuffer[key] ?? value);
                          setViewMode('preview');
                        }}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-accent-hover"
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : viewMode === 'audit' && auditResult ? (
                  <div className="mt-1 max-h-[500px] overflow-auto rounded-lg border border-border-subtle bg-surface-2 p-4">
                    {auditResult.total === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <span className="text-lg">&#10003;</span> No violations found
                      </div>
                    ) : auditResult.total === -1 ? (
                      <div className="text-sm text-red-400">Audit failed. Try again.</div>
                    ) : (
                      <>
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-semibold text-text-primary">
                            {auditResult.total} violation{auditResult.total !== 1 ? 's' : ''} found
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleAutoFix}
                              disabled={isReworking}
                              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-text-inverse hover:bg-accent-hover disabled:opacity-50"
                            >
                              {isReworking ? 'Fixing...' : 'Auto-Fix'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAudit(false)}
                              disabled={isAuditing}
                              className="rounded-lg border border-border-default px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-3 disabled:opacity-50"
                            >
                              Re-audit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditBuffer({ ...editBuffer, [key]: value });
                                setViewMode('edit');
                              }}
                              className="rounded-lg border border-border-default px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-3"
                            >
                              Manual Edit
                            </button>
                          </div>
                        </div>

                        {/* Rework progress */}
                        {reworkRounds.length > 0 && (
                          <div className="mb-3 rounded-lg bg-accent/10 p-2 text-xs text-accent">
                            {reworkRounds.map((r) => (
                              <div key={r.round}>
                                Round {r.round}: {r.fixedCount} fixed, {r.remainingCount} remaining
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Mechanical violations */}
                        {auditResult.mechanical > 0 && (
                          <div className="mb-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                              Mechanical ({auditResult.mechanical})
                            </p>
                            <div className="space-y-1">
                              {auditResult.violations
                                .filter((v) => v.type === 'mechanical')
                                .map((v, i) => (
                                  <div
                                    key={`m-${i}`}
                                    className="rounded border-l-2 border-red-400 bg-red-500/10 px-3 py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-red-400">{v.rule}</span>
                                    {v.line > 0 && (
                                      <span className="ml-1 text-red-400/60">line {v.line}</span>
                                    )}
                                    <p className="mt-0.5 text-text-secondary">{v.explanation}</p>
                                    <p className="mt-0.5 truncate text-text-tertiary italic">
                                      {v.sentence.slice(0, 120)}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Subjective violations */}
                        {auditResult.subjective > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                              Subjective ({auditResult.subjective}) — AI scan
                            </p>
                            <div className="space-y-1">
                              {auditResult.violations
                                .filter((v) => v.type === 'subjective')
                                .map((v, i) => (
                                  <div
                                    key={`s-${i}`}
                                    className="rounded border-l-2 border-amber-400 bg-amber-400/10 px-3 py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-amber-400">{v.rule}</span>
                                    {v.line > 0 && (
                                      <span className="ml-1 text-amber-400/60">line {v.line}</span>
                                    )}
                                    <p className="mt-0.5 text-text-secondary">{v.explanation}</p>
                                    <p className="mt-0.5 truncate text-text-tertiary italic">
                                      {v.sentence.slice(0, 120)}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : viewMode === 'raw' ? (
                  <pre className="mt-1 max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-text-secondary whitespace-pre-wrap">
                    {value}
                  </pre>
                ) : (
                  <div className="mt-1 max-h-96 overflow-auto rounded-lg bg-surface-2 border border-border-subtle p-4 prose prose-sm prose-invert max-w-none">
                    <Markdown>{value}</Markdown>
                  </div>
                )}
              </div>
            );
          })}

      {/* Editor Rounds */}
      {step.editorRounds && step.editorRounds.length > 0 && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <h5 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Editor Review</h5>
          {step.editorRounds.map((round) => (
            <div key={round.round} className="mb-2 rounded-lg bg-surface-2 p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-text-secondary">
                  Round {round.round}/{round.maxRounds}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    round.verdict === 'approve'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-amber-400/15 text-amber-400'
                  }`}
                >
                  {round.verdict === 'approve' ? 'Approved' : 'Revise'}
                </span>
              </div>
              <p className="text-text-secondary">{round.feedback}</p>
            </div>
          ))}
        </div>
      )}

      {/* Manual Approval */}
      {step.awaitingApproval && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <h5 className="text-sm font-semibold text-amber-400 mb-2">
              Editor Feedback — Your Approval Needed
            </h5>
            <p className="text-sm text-text-secondary mb-3">
              {step.awaitingApproval.editorFeedback}
            </p>
            <textarea
              value={editFeedback}
              onChange={(e) => setEditFeedback(e.target.value)}
              placeholder="Optionally edit the feedback before sending..."
              rows={2}
              className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-sm text-text-primary mb-2"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onApprove('approve')}>
                Accept Output
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onApprove('revise', editFeedback || step.awaitingApproval!.editorFeedback)
                }
              >
                Send to Generator
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
