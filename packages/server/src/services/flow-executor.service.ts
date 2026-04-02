import { eq, and } from 'drizzle-orm';
import type { FlowStep, SkillConfig, AICompletionRequest, EditorConfig } from '@cc/shared';
import type { StepResult, FlowExecutionResponse, SSEEvent } from '@cc/shared';
import { db, schema } from '../db/index.js';
import { providerRegistry } from './ai/index.js';
import { interpolate } from './skills/interpolate.js';
import { withSessionGate, checkFlowQuota } from './session-gate.service.js';
import { NotFoundError, ForbiddenError, AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { getActiveRules } from './profile.service.js';
import { getSetting } from './admin.service.js';
import { getModelPricing, calculateCost } from './usage.service.js';

const DEFAULT_AI_TIMEOUT_MS = 180_000;
const MAX_EDITOR_ROUNDS = 10;

async function getAITimeoutMs(): Promise<number> {
  try {
    const setting = await getSetting('site');
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.aiTimeoutSeconds) return config.aiTimeoutSeconds * 1000;
    }
  } catch {
    /* use default */
  }
  return DEFAULT_AI_TIMEOUT_MS;
}

export async function executeFlow(
  flowId: string,
  userId: string,
  inputs: Record<string, string>,
  role: string = 'Subscriber',
): Promise<FlowExecutionResponse> {
  const start = Date.now();

  // Load flow
  const flow = await db.query.flows.findFirst({
    where: eq(schema.flows.id, flowId),
  });

  if (!flow) throw new NotFoundError('Flow not found');
  if (flow.userId !== userId) throw new ForbiddenError('Access denied');

  const steps = await loadFlowSteps(flowId);

  if (steps.length === 0) {
    throw new AppError(400, 'Flow has no steps to execute');
  }

  // Pre-check: ensure user has enough sessions for all AI steps
  await checkFlowQuota(userId, role, steps.length);

  // Load global rules
  const activeRules = await getActiveRules(userId);
  const globalRules =
    activeRules.length > 0 ? activeRules.map((r) => r.rules).join('\n\n') : undefined;

  const executionContext: Record<string, string> = { ...inputs };
  const stepResults: StepResult[] = [];

  for (const step of steps) {
    const stepResult = await executeStep(step, executionContext, globalRules, userId, role);
    stepResults.push(stepResult);

    // Add step outputs to context for chaining
    if (stepResult.status === 'success') {
      for (const [key, value] of Object.entries(stepResult.outputs)) {
        executionContext[`step_${step.id}.${key}`] = value;
      }
    } else {
      // Stop on first error
      logger.error({ stepId: step.id, error: stepResult.error }, 'Step execution failed');
      break;
    }
  }

  const totalDurationMs = Date.now() - start;
  const allSucceeded = stepResults.every((r) => r.status === 'success');

  return {
    flowId,
    status: allSucceeded ? 'completed' : 'failed',
    stepResults,
    totalDurationMs,
  };
}

async function executeStep(
  step: FlowStep,
  context: Record<string, string>,
  globalRules?: string,
  userId?: string,
  role: string = 'Subscriber',
): Promise<StepResult> {
  const start = Date.now();

  try {
    let promptText: string;
    let systemPrompt: string | undefined;
    let temperature: number | undefined;
    let maxTokens: number | undefined;
    const skillId = step.skillId ?? 'raw';

    if (step.skillId) {
      // Skill-based step
      const skillConfig = await loadSkillConfig(step.skillId, step.skillVersion);

      // Resolve input mappings
      const resolvedInputs: Record<string, string> = {};
      if (step.inputMappings) {
        for (const [skillKey, contextKey] of Object.entries(step.inputMappings)) {
          resolvedInputs[skillKey] = context[contextKey] ?? '';
        }
      }

      // Also map direct context keys matching skill input keys
      for (const input of skillConfig.inputs) {
        if (!resolvedInputs[input.key] && context[input.key]) {
          resolvedInputs[input.key] = context[input.key];
        }
        // Apply defaults for missing values
        if (!resolvedInputs[input.key] && input.defaultValue) {
          resolvedInputs[input.key] = input.defaultValue;
        }
      }

      promptText = interpolate(skillConfig.promptTemplate, resolvedInputs);
      systemPrompt = step.overrides?.systemPrompt ?? skillConfig.systemPrompt;
      temperature = step.overrides?.temperature ?? skillConfig.temperature;
      maxTokens = step.overrides?.maxTokens ?? skillConfig.maxTokens;
    } else {
      // Legacy raw-prompt step
      promptText = interpolate(step.prompt, context);
    }

    // Build AI request
    const messages: AICompletionRequest['messages'] = [];
    if (globalRules) {
      messages.push({
        role: 'system',
        content: `GLOBAL RULES (always follow these):\n\n${globalRules}`,
      });
    }
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: promptText });

    const model = step.model;

    // Check if any providers are registered
    const providers = providerRegistry.listProviders();
    if (providers.length === 0) {
      throw new AppError(
        503,
        `No AI providers configured. Add an API key in Settings → Integrations to enable flow execution. (Step requires model: ${model || 'default'})`,
      );
    }

    const request: AICompletionRequest = {
      model,
      messages,
      temperature,
      maxTokens,
    };

    const response = userId
      ? await withSessionGate(userId, role, () => providerRegistry.complete(request))
      : await providerRegistry.complete(request);
    const durationMs = Date.now() - start;

    // Map response to skill outputs — strip thinking blocks from reasoning models
    const outputs: Record<string, string> = {};
    const outputContent = response.imageUrl ?? stripThinkingBlocks(response.content);

    if (step.skillId) {
      const skillConfig = await loadSkillConfig(step.skillId, step.skillVersion);
      if (skillConfig.outputs.length === 1) {
        outputs[skillConfig.outputs[0].key] = outputContent;
        // Store content type hint for the UI
        if (response.contentType) {
          outputs[`__type_${skillConfig.outputs[0].key}`] = response.contentType;
        }
      } else {
        outputs['result'] = outputContent;
        if (response.contentType) {
          outputs['__type_result'] = response.contentType;
        }
      }
    } else {
      outputs['result'] = outputContent;
      if (response.contentType) {
        outputs['__type_result'] = response.contentType;
      }
    }

    return {
      stepId: step.id,
      skillId,
      outputs,
      usage: response.usage,
      model: response.model,
      durationMs,
      status: 'success',
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';

    return {
      stepId: step.id,
      skillId: step.skillId ?? 'raw',
      outputs: {},
      usage: { inputTokens: 0, outputTokens: 0 },
      model: step.model || 'unknown',
      durationMs,
      status: 'error',
      error: message,
    };
  }
}

async function loadSkill(skillId: string, version?: number) {
  if (version) {
    const sv = await db.query.skillVersions.findFirst({
      where: and(
        eq(schema.skillVersions.skillId, skillId),
        eq(schema.skillVersions.version, version),
      ),
    });
    if (sv) return sv;
  }

  // Fall back to current skill
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });

  if (!skill) throw new NotFoundError(`Skill ${skillId} not found`);
  return skill;
}

// --- Load from normalized tables ---

async function loadFlowSteps(flowId: string): Promise<FlowStep[]> {
  const rows = await db.query.flowSteps.findMany({
    where: eq(schema.flowSteps.flowId, flowId),
  });
  return rows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      id: r.stepId,
      skillId: r.skillId ?? undefined,
      skillVersion: r.skillVersion ?? undefined,
      inputMappings: (r.inputMappings as Record<string, string>) ?? {},
      overrides: (r.overrides as FlowStep['overrides']) ?? undefined,
      editor: (r.editorConfig as EditorConfig) ?? undefined,
      provider: r.provider,
      model: r.model,
      prompt: r.prompt,
      capabilities: (r.capabilities as FlowStep['capabilities']) ?? [],
      order: r.sortOrder,
    }));
}

async function loadSkillConfig(skillId: string, version?: number): Promise<SkillConfig> {
  // Versioned skills still use JSONB (not normalized)
  if (version) {
    const sv = await db.query.skillVersions.findFirst({
      where: and(
        eq(schema.skillVersions.skillId, skillId),
        eq(schema.skillVersions.version, version),
      ),
    });
    if (sv) return sv.config as SkillConfig;
  }

  // Current skill — read from normalized tables + scalar columns
  const skill = await db.query.skills.findFirst({
    where: eq(schema.skills.id, skillId),
  });
  if (!skill) throw new NotFoundError(`Skill ${skillId} not found`);

  const inputRows = await db.query.skillInputs.findMany({
    where: eq(schema.skillInputs.skillId, skillId),
  });
  const outputRows = await db.query.skillOutputs.findMany({
    where: eq(schema.skillOutputs.skillId, skillId),
  });

  return {
    inputs: inputRows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.inputId,
        key: i.key,
        type: i.type as SkillConfig['inputs'][number]['type'],
        label: i.label,
        description: i.description ?? undefined,
        required: i.isRequired,
        defaultValue: i.defaultValue ?? undefined,
        options: (i.options as string[]) ?? [],
      })),
    outputs: outputRows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({
        key: o.key,
        type: o.type as SkillConfig['outputs'][number]['type'],
        label: o.label,
        description: o.description ?? undefined,
        visible: o.isVisible,
      })),
    promptTemplate: skill.promptTemplate ?? '',
    systemPrompt: skill.systemPrompt ?? undefined,
    temperature: skill.temperature ?? undefined,
    maxTokens: skill.maxTokens ?? undefined,
    capabilities: (skill.capabilities as SkillConfig['capabilities']) ?? [],
    defaultProvider: skill.defaultProvider ?? undefined,
    defaultModel: skill.defaultModel ?? undefined,
  };
}

// --- Streaming executor ---

export type SSEEmitter = (event: SSEEvent) => void;

export interface StreamingOptions {
  signal?: AbortSignal;
}

// DB-backed approval polling — replaces in-memory Promise approach
async function waitForApproval(
  flowId: string,
  userId: string,
  stepIndex: number,
  round: number,
  generatorOutput: string,
  editorFeedback: string,
  signal?: AbortSignal,
): Promise<{ action: 'approve' | 'revise' | 'edit'; feedback?: string }> {
  // Insert pending approval record and get its ID
  const [inserted] = await db
    .insert(schema.pendingApprovals)
    .values({
      flowId,
      userId,
      stepIndex,
      round,
      generatorOutput: generatorOutput.slice(0, 50000),
      editorFeedback: editorFeedback.slice(0, 10000),
      status: 'pending',
    })
    .returning();

  logger.info(
    { flowId, stepIndex, round, approvalId: inserted.id },
    'Waiting for manual editor approval (DB polling)...',
  );

  // Poll DB every 2 seconds — check if the record's status changed from 'pending'
  const maxWait = 30 * 60 * 1000; // 30 minutes
  const pollInterval = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    if (signal?.aborted) {
      await db.delete(schema.pendingApprovals).where(eq(schema.pendingApprovals.id, inserted.id));
      return { action: 'approve' };
    }

    const record = await db.query.pendingApprovals.findFirst({
      where: eq(schema.pendingApprovals.id, inserted.id),
    });

    if (record && record.status !== 'pending') {
      logger.info({ flowId, stepIndex, action: record.userAction }, 'Manual approval received');
      return {
        action: (record.userAction as 'approve' | 'revise' | 'edit') ?? 'approve',
        feedback: record.userFeedback ?? undefined,
      };
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // Timeout — auto-approve and clean up
  logger.warn({ flowId, stepIndex, round }, 'Manual approval timed out (30min) — auto-approving');
  await db.delete(schema.pendingApprovals).where(eq(schema.pendingApprovals.id, inserted.id));
  return { action: 'approve' };
}

export async function executeFlowStreaming(
  flowId: string,
  userId: string,
  inputs: Record<string, string>,
  emit: SSEEmitter,
  options: StreamingOptions = {},
  role: string = 'Subscriber',
): Promise<void> {
  const start = Date.now();

  const flow = await db.query.flows.findFirst({
    where: eq(schema.flows.id, flowId),
  });

  if (!flow) throw new NotFoundError('Orchestration not found');
  if (flow.userId !== userId) throw new ForbiddenError('Access denied');

  const steps = await loadFlowSteps(flowId);

  if (steps.length === 0) {
    throw new AppError(400, 'Orchestration has no steps to execute');
  }

  // Pre-check: ensure user has enough sessions for all AI steps
  await checkFlowQuota(userId, role, steps.length);

  // Load global rules
  const activeRules = await getActiveRules(userId);
  const globalRules =
    activeRules.length > 0 ? activeRules.map((r) => r.rules).join('\n\n') : undefined;

  const executionContext: Record<string, string> = { ...inputs };
  const collectedResults: Array<{
    stepIndex: number;
    skillName: string;
    model: string;
    output: Record<string, string>;
    duration: number;
    tokens: { input: number; output: number };
    status: string;
    error?: string;
  }> = [];
  let allSucceeded = true;

  for (let i = 0; i < steps.length; i++) {
    // Check abort signal
    if (options.signal?.aborted) {
      logger.info({ flowId, stepIndex: i }, 'Execution aborted by client disconnect');
      break;
    }

    const step = steps[i];
    const skillName = await getSkillName(step);

    emit({ type: 'step_start', data: { stepIndex: i, skillName, model: step.model || 'auto' } });

    const stepResult = await executeStepWithTimeout(
      step,
      executionContext,
      globalRules,
      userId,
      role,
    );

    // Log execution
    await logExecution(flowId, userId, i, skillName, stepResult, 0, step.skillId);

    if (stepResult.status === 'success') {
      // Run editor loop if enabled
      let finalOutput = stepResult.outputs;
      let editorRounds = 0;

      if (step.editor?.enabled && stepResult.outputs) {
        const editorResult = await runEditorLoop(
          step,
          stepResult,
          executionContext,
          i,
          emit,
          options,
          globalRules,
          flowId,
          userId,
          role,
        );
        finalOutput = editorResult.outputs;
        editorRounds = editorResult.rounds;

        // Update execution log with editor rounds
        if (editorRounds > 0) {
          await logExecution(
            flowId,
            userId,
            i,
            `${skillName} (editor)`,
            {
              ...stepResult,
              outputs: finalOutput,
            },
            editorRounds,
            step.skillId,
          );
        }
      }

      for (const [key, value] of Object.entries(finalOutput)) {
        executionContext[`step_${step.id}.${key}`] = value;
      }

      const pricing = await getModelPricing();
      const stepCost = calculateCost(
        stepResult.model,
        stepResult.usage.inputTokens,
        stepResult.usage.outputTokens,
        pricing,
      );

      emit({
        type: 'step_complete',
        data: {
          stepIndex: i,
          output: finalOutput,
          duration: stepResult.durationMs,
          tokens: { input: stepResult.usage.inputTokens, output: stepResult.usage.outputTokens },
          model: stepResult.model,
          estimatedCost: stepCost,
        },
      });
      collectedResults.push({
        stepIndex: i,
        skillName,
        model: stepResult.model,
        output: finalOutput,
        duration: stepResult.durationMs,
        tokens: { input: stepResult.usage.inputTokens, output: stepResult.usage.outputTokens },
        status: 'success',
      });
    } else {
      allSucceeded = false;
      collectedResults.push({
        stepIndex: i,
        skillName,
        model: stepResult.model,
        output: {},
        duration: stepResult.durationMs,
        tokens: { input: 0, output: 0 },
        status: 'error',
        error: stepResult.error,
      });
      emit({
        type: 'step_error',
        data: { stepIndex: i, error: stepResult.error ?? 'Unknown error' },
      });
      break;
    }
  }

  const totalDuration = Date.now() - start;
  const finalStatus = allSucceeded ? 'completed' : 'failed';

  // Save execution run to DB for history
  try {
    await db.insert(schema.executionRuns).values({
      flowId,
      userId,
      inputs,
      stepResults: collectedResults,
      status: finalStatus,
      totalDuration,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to save execution run — non-blocking');
  }

  // Calculate total cost across all steps
  let totalCost: number | null = null;
  try {
    const pricing = await getModelPricing();
    totalCost = 0;
    for (const r of collectedResults) {
      if (r.status === 'success') {
        const c = calculateCost(r.model, r.tokens.input, r.tokens.output, pricing);
        if (c !== null) totalCost += c;
      }
    }
  } catch {
    /* non-blocking */
  }

  emit({
    type: 'done',
    data: { totalDuration, status: finalStatus, totalEstimatedCost: totalCost },
  });
}

// --- Single step re-run ---

export async function rerunSingleStep(
  flowId: string,
  userId: string,
  stepIndex: number,
  executionContext: Record<string, string>,
): Promise<StepResult> {
  const flow = await db.query.flows.findFirst({
    where: eq(schema.flows.id, flowId),
  });

  if (!flow) throw new NotFoundError('Orchestration not found');
  if (flow.userId !== userId) throw new ForbiddenError('Access denied');

  // Load global rules
  const activeRules = await getActiveRules(userId);
  const globalRules =
    activeRules.length > 0 ? activeRules.map((r) => r.rules).join('\n\n') : undefined;

  const steps = await loadFlowSteps(flowId);

  if (stepIndex < 0 || stepIndex >= steps.length) {
    throw new AppError(400, `Invalid step index: ${stepIndex}`);
  }

  const step = steps[stepIndex];
  const result = await executeStepWithTimeout(step, executionContext, globalRules);

  // Log the re-run
  const skillName = await getSkillName(step);
  await logExecution(flowId, userId, stepIndex, `${skillName} (rerun)`, result, 0, step.skillId);

  return result;
}

async function getSkillName(step: FlowStep): Promise<string> {
  if (!step.skillId) return 'Raw Prompt';
  try {
    const skill = await loadSkill(step.skillId, step.skillVersion);
    return (skill as { name?: string }).name ?? 'Unknown Skill';
  } catch {
    return 'Unknown Skill';
  }
}

async function executeStepWithTimeout(
  step: FlowStep,
  context: Record<string, string>,
  globalRules?: string,
  userId?: string,
  role: string = 'Subscriber',
): Promise<StepResult> {
  const timeoutMs = await getAITimeoutMs();

  const attempt = async (): Promise<StepResult> => {
    return new Promise<StepResult>((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          stepId: step.id,
          skillId: step.skillId ?? 'raw',
          outputs: {},
          usage: { inputTokens: 0, outputTokens: 0 },
          model: step.model || 'unknown',
          durationMs: timeoutMs,
          status: 'error',
          error: `AI provider timed out after ${timeoutMs / 1000} seconds`,
        });
      }, timeoutMs);

      executeStep(step, context, globalRules, userId, role)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          resolve({
            stepId: step.id,
            skillId: step.skillId ?? 'raw',
            outputs: {},
            usage: { inputTokens: 0, outputTokens: 0 },
            model: step.model || 'unknown',
            durationMs: timeoutMs,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
    });
  };

  // First attempt
  const result = await attempt();

  // Retry once on timeout or rate limit
  if (
    result.status === 'error' &&
    (result.error?.includes('timed out') || result.error?.includes('429'))
  ) {
    logger.warn({ stepId: step.id, error: result.error }, 'Retrying step after failure');
    await new Promise((r) => setTimeout(r, 5000)); // 5s backoff
    return attempt();
  }

  return result;
}

// --- Strip thinking/reasoning blocks from AI output ---

/**
 * Strips chain-of-thought reasoning that reasoning models dump into output.
 * Handles: Qwen (<think>, plain text), DeepSeek R1 (<think>), Kimi K2 (<think>),
 *          GLM-5 (<reasoning>), and generic self-dialogue patterns.
 */
export function stripThinkingBlocks(content: string): string {
  let cleaned = content;

  // 1. XML-style thinking tags (DeepSeek R1, Kimi K2, Qwen)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
  cleaned = cleaned.replace(/<internal_monologue>[\s\S]*?<\/internal_monologue>/gi, '').trim();

  // 2. "Thinking Process:" plain text block (Qwen 3.x)
  //    Match from "Thinking Process:" until the actual content starts
  //    Content starts at: a markdown heading, "Block 1", a title in proper case, or JSON
  cleaned = cleaned
    .replace(
      /^(?:Thinking Process|Chain of Thought|Internal Reasoning|Reasoning|Analysis):?\s*\n[\s\S]*?(?=^(?:#{1,3}\s|Block \d|[A-Z][a-z]+ [A-Z][a-z]+\n|\{))/im,
      '',
    )
    .trim();

  // 3. "Wait, check..." self-dialogue loops (Qwen reasoning artifacts)
  //    These appear as blocks of short lines starting with "Wait,", "OK.", "Review against", "Check"
  cleaned = cleaned
    .replace(
      /(?:^(?:Wait,|OK\.|Review against|Check |Fix:|I need to|I will|Let me|Scan |Revision|My |Total:)[^\n]*\n?){3,}/gim,
      '',
    )
    .trim();

  // 4. Numbered self-check lines: "Sentence 1: ... (OK)" or "Sentence 1: ... (Active, no banned words)."
  cleaned = cleaned.replace(/(?:^Sentence \d+:.*\n?){3,}/gim, '').trim();

  // 5. Word-by-word banned word scanning: lines like '"Rain"(1) taps(2)...' or 'Wait, check "that" in "..."'
  cleaned = cleaned
    .replace(/(?:^(?:Wait, check|"[A-Za-z]+"(?:\(\d+\))?)[^\n]*\n?){3,}/gim, '')
    .trim();

  // 6. If content still starts with a huge reasoning block before the real output,
  //    look for common essay/content markers and trim everything before
  if (cleaned.length > 3000) {
    const contentMarkers = [
      /^Block 1\s*[—–-]\s*Essay/im,
      /^#{1,2}\s+[A-Z]/m,
      /^[A-Z][a-z]+(?:\s[A-Za-z]+){1,5}\n\n/m, // Title line followed by blank line
    ];
    for (const marker of contentMarkers) {
      const match = cleaned.match(marker);
      if (match && match.index && match.index > 500) {
        cleaned = cleaned.slice(match.index).trim();
        break;
      }
    }
  }

  return cleaned;
}

// --- Editor critique loop ---

function parseEditorVerdict(raw: string): { verdict: string; feedback: string } {
  // Strip thinking/reasoning blocks
  let cleaned = stripThinkingBlocks(raw);
  // For editor verdicts: if still huge, extract just the JSON
  if (cleaned.length > 5000) {
    const jsonExtract = cleaned.match(/\{[\s\S]*?"verdict"[\s\S]*?"feedback"[\s\S]*?\}/);
    if (jsonExtract) cleaned = jsonExtract[0];
  }

  // Detect template echo — model returned the format instruction instead of actual feedback
  if (cleaned.includes('"approve"|"revise"') || cleaned.includes("'approve'|'revise'")) {
    return {
      verdict: 'approve',
      feedback: 'Editor returned format template instead of feedback. Auto-approved.',
    };
  }

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.verdict && parsed.feedback) return parsed;
  } catch {
    /* continue */
  }

  // Try extracting JSON from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed.verdict && parsed.feedback) return parsed;
    } catch {
      /* continue */
    }
  }

  // Try extracting JSON object from mixed text
  const jsonMatch = cleaned.match(/\{[\s\S]*?"verdict"[\s\S]*?"feedback"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.verdict && parsed.feedback) return parsed;
    } catch {
      /* continue */
    }
  }

  // Keyword fallback — scan for approve/revise intent in plain text
  const lower = cleaned.toLowerCase();
  if (lower.includes('approve') && !lower.includes('revise') && !lower.includes('revision')) {
    return { verdict: 'approve', feedback: cleaned };
  }

  // Default to revise — use cleaned response as feedback (it's likely critique text)
  return { verdict: 'revise', feedback: cleaned.slice(0, 2000) };
}

async function runEditorLoop(
  step: FlowStep,
  stepResult: StepResult,
  _context: Record<string, string>,
  stepIndex: number,
  emit: SSEEmitter,
  options: StreamingOptions,
  globalRules?: string,
  flowId?: string,
  userId?: string,
  role: string = 'Subscriber',
): Promise<{ outputs: Record<string, string>; rounds: number }> {
  const editor = step.editor as EditorConfig;
  const maxRounds = Math.min(editor.maxRounds, MAX_EDITOR_ROUNDS);
  let currentOutput = Object.values(stepResult.outputs).join('\n');
  const outputs = { ...stepResult.outputs };
  let round = 0;

  const editorSystemPrompt = `You are a content editor. Your ONLY output format is a single JSON object. No prose, no explanation, no markdown — just the JSON.

OUTPUT FORMAT (strictly enforced):
{"verdict": "approve", "feedback": "Approved."}
or
{"verdict": "revise", "feedback": "Your specific, actionable feedback here as a single string."}

RULES:
- Your entire response must be parseable by JSON.parse()
- Do not wrap in code blocks or backticks
- Do not add any text before or after the JSON
- Put ALL feedback inside the "feedback" string value
- Use "approve" only when the output meets the standard below
- Use "revise" when improvements are needed
- Keep feedback under 500 words. Be specific but concise — list the top issues, not every minor nitpick
- Do NOT use markdown code blocks in your response

EDITOR STANDARD:
${editor.systemPrompt}`;

  // Accumulate conversation history so editor sees prior rounds
  const editorHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: editorSystemPrompt },
  ];

  for (round = 1; round <= maxRounds; round++) {
    if (options.signal?.aborted) break;

    // Editor critiques — with full conversation history
    try {
      const roundContext =
        round === maxRounds
          ? '\nThis is the FINAL round. Approve unless there are critical factual errors or major structural problems. Style preferences and minor polish should be accepted at this stage.'
          : round >= Math.ceil(maxRounds * 0.75)
            ? '\nFocus only on significant issues. Minor style preferences should be approved.'
            : '';

      const userMessage = `Round ${round} of ${maxRounds}.${roundContext}\n\nReview this output:\n\n${currentOutput}`;
      editorHistory.push({ role: 'user', content: userMessage });

      const editorResponse = userId
        ? await withSessionGate(userId, role, () =>
            providerRegistry.complete({
              model: editor.model,
              messages: [...editorHistory],
              temperature: 0.3,
              maxTokens: 4000,
            }),
          )
        : await providerRegistry.complete({
            model: editor.model,
            messages: [...editorHistory],
            temperature: 0.3,
            maxTokens: 4000,
          });

      // Add editor's response to history for next round
      editorHistory.push({ role: 'assistant', content: editorResponse.content });

      const verdict = parseEditorVerdict(editorResponse.content);

      if (verdict.verdict === 'approve') {
        emit({
          type: 'editor_round',
          data: {
            stepIndex,
            round,
            maxRounds,
            verdict: 'approve',
            feedback: verdict.feedback,
          },
        });
        break;
      }

      // Manual approval mode — wait for user via DB polling
      if (editor.approvalMode === 'manual' && flowId && userId) {
        emit({
          type: 'editor_approval_needed',
          data: {
            stepIndex,
            round,
            generatorOutput: currentOutput,
            editorFeedback: verdict.feedback,
          },
        });

        const userDecision = await waitForApproval(
          flowId,
          userId,
          stepIndex,
          round,
          currentOutput,
          verdict.feedback,
          options.signal,
        );

        if (userDecision.action === 'approve') break;
        if (userDecision.action === 'edit' && userDecision.feedback) {
          verdict.feedback = userDecision.feedback;
        }
      }

      // Generator revises based on feedback
      const reviseRequest = {
        model: step.model,
        messages: [
          ...(globalRules
            ? [
                {
                  role: 'system' as const,
                  content: `GLOBAL RULES (always follow these):\n\n${globalRules}`,
                },
              ]
            : []),
          ...(step.overrides?.systemPrompt
            ? [{ role: 'system' as const, content: step.overrides.systemPrompt }]
            : []),
          {
            role: 'user' as const,
            content: `Here is your previous output:\n\n${currentOutput}\n\nEditor feedback:\n${verdict.feedback}\n\nPlease revise your output to address this feedback. Output only the revised content.`,
          },
        ],
        temperature: step.overrides?.temperature,
        maxTokens: step.overrides?.maxTokens,
      };
      const reviseResponse = userId
        ? await withSessionGate(userId, role, () => providerRegistry.complete(reviseRequest))
        : await providerRegistry.complete(reviseRequest);

      currentOutput = reviseResponse.content;
      // Update the first output key with revised content
      const firstKey = Object.keys(outputs)[0] ?? 'result';
      outputs[firstKey] = currentOutput;

      emit({
        type: 'editor_round',
        data: {
          stepIndex,
          round,
          maxRounds,
          verdict: 'revise',
          feedback: verdict.feedback,
          revisedOutput: currentOutput,
        },
      });
    } catch (err) {
      logger.error({ err, stepIndex, round }, 'Editor loop error — using current output');
      break;
    }
  }

  // Force-approve if maxRounds exhausted without approval
  if (round > maxRounds) {
    emit({
      type: 'editor_round',
      data: {
        stepIndex,
        round: maxRounds,
        maxRounds,
        verdict: 'approve',
        feedback: `Editor limit reached (${maxRounds} rounds). Auto-approved with latest revision.`,
      },
    });
  }

  return { outputs, rounds: Math.min(round, maxRounds) };
}

// --- Execution logging ---

async function logExecution(
  flowId: string,
  userId: string,
  stepIndex: number,
  skillName: string,
  result: StepResult,
  editorRounds = 0,
  skillId?: string | null,
): Promise<void> {
  try {
    await db.insert(schema.executionLogs).values({
      flowId,
      userId,
      stepIndex,
      skillName,
      skillId: skillId ?? null,
      model: result.model,
      provider: null,
      providerId: null,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      duration: result.durationMs,
      status: result.status,
      editorRounds,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to log execution — non-blocking');
  }
}
