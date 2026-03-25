import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse, FlowExecutionResponse } from '@cc/shared';
import { eq, and, desc } from 'drizzle-orm';
import { UnauthorizedError, AppError } from '../utils/errors.js';
import * as flowExecutor from '../services/flow-executor.service.js';
import * as contentAuditor from '../services/content-auditor.service.js';
import { signAccessToken } from '../utils/jwt.js';
import { logger } from '../config/logger.js';
import { db, schema } from '../db/index.js';

// --- Execution token store (in-memory, single-use) ---

interface ExecToken {
  flowId: string;
  userId: string;
  inputs: Record<string, string>;
  expiresAt: number;
}

const execTokenStore = new Map<string, ExecToken>();

// Cleanup expired tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of execTokenStore) {
    if (val.expiresAt < now) execTokenStore.delete(key);
  }
}, 60_000);

// --- Original sync execute endpoint ---

export async function executeFlow(
  req: Request,
  res: Response<ApiResponse<FlowExecutionResponse>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { id } = req.params;
    const { inputs } = req.body;

    const result = await flowExecutor.executeFlow(id, req.user.userId, inputs);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// --- B1: Execution token endpoint ---

export async function createExecutionToken(
  req: Request,
  res: Response<ApiResponse<{ token: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { id } = req.params;
    const { inputs } = req.body;

    // Generate a short-lived token
    const tokenPayload = { userId: req.user.userId, email: req.user.email, name: req.user.name, role: req.user.role };
    const token = signAccessToken(tokenPayload) + '.' + crypto.randomUUID().slice(0, 8);

    execTokenStore.set(token, {
      flowId: id,
      userId: req.user.userId,
      inputs: inputs ?? {},
      expiresAt: Date.now() + 60_000, // 60s TTL
    });

    res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
}

// --- B2: SSE streaming endpoint ---

export async function executeFlowStream(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const token = req.query.token as string;

  if (!token) {
    res.status(401).json({ success: false, error: 'Missing execution token' });
    return;
  }

  // Validate and consume token (single-use)
  const execData = execTokenStore.get(token);
  if (!execData) {
    res.status(401).json({ success: false, error: 'Invalid or expired execution token' });
    return;
  }

  if (execData.expiresAt < Date.now()) {
    execTokenStore.delete(token);
    res.status(401).json({ success: false, error: 'Execution token expired' });
    return;
  }

  // Consume token — single use
  execTokenStore.delete(token);

  const { flowId, userId, inputs } = execData;

  // Verify flowId matches route param
  if (req.params.id !== flowId) {
    res.status(403).json({ success: false, error: 'Token does not match this orchestration' });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Abort controller for client disconnect
  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
    logger.info({ flowId }, 'Client disconnected from SSE stream');
  });

  // SSE emitter
  const emit: flowExecutor.SSEEmitter = (event) => {
    if (clientDisconnected) return;
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    } catch {
      // Client may have disconnected
    }
  };

  try {
    await flowExecutor.executeFlowStreaming(flowId, userId, inputs, emit, {
      signal: abortController.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution failed';
    emit({ type: 'step_error', data: { stepIndex: -1, error: message } });
    emit({ type: 'done', data: { totalDuration: 0, status: 'failed' } });
  } finally {
    if (!clientDisconnected) {
      res.end();
    }
  }
}

// --- C3: Manual approval endpoint ---

export async function approveEditorStep(
  req: Request,
  res: Response<ApiResponse<null>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { id } = req.params;
    const { stepIndex, action, feedback } = req.body;

    // Find the pending approval in DB
    const pending = await db.query.pendingApprovals.findFirst({
      where: and(
        eq(schema.pendingApprovals.flowId, id),
        eq(schema.pendingApprovals.userId, req.user.userId),
        eq(schema.pendingApprovals.stepIndex, stepIndex),
        eq(schema.pendingApprovals.status, 'pending'),
      ),
    });

    if (!pending) {
      throw new AppError(404, 'No pending approval found for this step');
    }

    // Update status — the executor's DB polling will detect this
    await db.update(schema.pendingApprovals)
      .set({
        status: action === 'approve' ? 'approved' : 'revised',
        userAction: action,
        userFeedback: feedback ?? null,
      })
      .where(eq(schema.pendingApprovals.id, pending.id));

    logger.info({ flowId: id, stepIndex, action }, 'Editor approval submitted via DB');
    res.json({ success: true, data: null, message: 'Approval submitted' });
  } catch (err) {
    next(err);
  }
}

// --- History endpoints ---

export async function listExecutionRuns(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { id } = req.params;
    const runs = await db.query.executionRuns.findMany({
      where: and(
        eq(schema.executionRuns.flowId, id),
        eq(schema.executionRuns.userId, req.user.userId),
      ),
      orderBy: [desc(schema.executionRuns.createdAt)],
      columns: {
        id: true,
        status: true,
        totalDuration: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: runs });
  } catch (err) {
    next(err);
  }
}

export async function getExecutionRun(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { id, runId } = req.params;
    const run = await db.query.executionRuns.findFirst({
      where: and(
        eq(schema.executionRuns.id, runId),
        eq(schema.executionRuns.flowId, id),
        eq(schema.executionRuns.userId, req.user.userId),
      ),
    });

    if (!run) {
      throw new AppError(404, 'Execution run not found');
    }

    res.json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
}

// --- History delete ---

export async function deleteExecutionRun(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { id, runId } = req.params;
    await db.delete(schema.executionRuns).where(
      and(
        eq(schema.executionRuns.id, runId),
        eq(schema.executionRuns.flowId, id),
        eq(schema.executionRuns.userId, req.user.userId),
      ),
    );
    res.json({ success: true, data: null, message: 'Run deleted' });
  } catch (err) {
    next(err);
  }
}

export async function deleteAllExecutionRuns(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    await db.delete(schema.executionRuns).where(
      and(
        eq(schema.executionRuns.flowId, id),
        eq(schema.executionRuns.userId, req.user.userId),
      ),
    );
    res.json({ success: true, data: null, message: 'All runs deleted' });
  } catch (err) {
    next(err);
  }
}

// --- Single step re-run ---

export async function rerunStep(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { id } = req.params;
    const { stepIndex, executionContext } = req.body;

    if (typeof stepIndex !== 'number' || !executionContext) {
      throw new AppError(400, 'stepIndex (number) and executionContext (object) are required');
    }

    const result = await flowExecutor.rerunSingleStep(id, req.user.userId, stepIndex, executionContext);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// --- Content Audit ---

export async function auditStepOutput(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { content, includeAi } = req.body;
    if (!content || typeof content !== 'string') {
      throw new AppError(400, 'content (string) is required');
    }

    let result;
    if (includeAi) {
      result = await contentAuditor.fullAudit(content, req.user.userId);
    } else {
      result = await contentAuditor.auditContent(content, req.user.userId);
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function reworkStepOutput(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { content, model, maxRounds } = req.body;
    if (!content || typeof content !== 'string') {
      throw new AppError(400, 'content (string) is required');
    }

    const reworkModel = model || 'claude-sonnet-4-6';
    const rounds = Math.min(maxRounds || 3, 5);

    const result = await contentAuditor.reworkLoop(content, req.user.userId, reworkModel, rounds);

    res.json({
      success: true,
      data: {
        finalContent: result.finalContent,
        rounds: result.rounds,
        remainingViolations: result.remainingViolations,
      },
    });
  } catch (err) {
    next(err);
  }
}
