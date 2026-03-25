import { Router } from 'express';
import { executeFlowSchema } from '@cc/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as executionController from '../controllers/execution.controller.js';

const router = Router();

router.use(authenticate);

// Original sync execute
router.post('/:id/execute', validate(executeFlowSchema), executionController.executeFlow);

// B1: Create execution token for SSE streaming
router.post('/:id/execute/token', executionController.createExecutionToken);

// C3: Manual approval during editor loop
router.post('/:id/execute/approve', executionController.approveEditorStep);

// Single step re-run
router.post('/:id/execute/step', executionController.rerunStep);

// Content audit + rework
router.post('/:id/audit', executionController.auditStepOutput);
router.post('/:id/rework', executionController.reworkStepOutput);

// History
router.get('/:id/executions', executionController.listExecutionRuns);
router.get('/:id/executions/:runId', executionController.getExecutionRun);
router.delete('/:id/executions', executionController.deleteAllExecutionRuns);
router.delete('/:id/executions/:runId', executionController.deleteExecutionRun);

// B2: SSE streaming endpoint (auth via token query param, not Bearer)
// This route does NOT use authenticate middleware — it validates via exec token
const streamRouter = Router();
streamRouter.get('/:id/execute/stream', executionController.executeFlowStream);

export { router as executionRoutes, streamRouter as executionStreamRoutes };
