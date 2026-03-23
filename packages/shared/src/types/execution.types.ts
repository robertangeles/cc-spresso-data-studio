export interface FlowExecutionContext {
  flowId: string;
  userId: string;
  inputs: Record<string, string>;
  stepResults: Record<string, StepResult>;
}

export interface StepResult {
  stepId: string;
  skillId: string;
  outputs: Record<string, string>;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
}

export interface FlowExecutionRequest {
  inputs: Record<string, string>;
}

export interface FlowExecutionResponse {
  flowId: string;
  status: 'completed' | 'failed';
  stepResults: StepResult[];
  totalDurationMs: number;
}

// --- SSE streaming events ---

export interface SSEStepStart {
  stepIndex: number;
  skillName: string;
  model: string;
}

export interface SSEStepComplete {
  stepIndex: number;
  output: Record<string, string>;
  duration: number;
  tokens: { input: number; output: number };
  model: string;
}

export interface SSEStepError {
  stepIndex: number;
  error: string;
}

export interface SSEEditorRound {
  stepIndex: number;
  round: number;
  maxRounds: number;
  verdict: 'approve' | 'revise';
  feedback: string;
  revisedOutput?: string;
}

export interface SSEEditorApprovalNeeded {
  stepIndex: number;
  round: number;
  generatorOutput: string;
  editorFeedback: string;
}

export interface SSEDone {
  totalDuration: number;
  status: 'completed' | 'failed';
}

export type SSEEvent =
  | { type: 'step_start'; data: SSEStepStart }
  | { type: 'step_complete'; data: SSEStepComplete }
  | { type: 'step_error'; data: SSEStepError }
  | { type: 'editor_round'; data: SSEEditorRound }
  | { type: 'editor_approval_needed'; data: SSEEditorApprovalNeeded }
  | { type: 'done'; data: SSEDone };
