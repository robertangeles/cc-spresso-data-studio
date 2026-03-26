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
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
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
export interface SSEStepStart {
  stepIndex: number;
  skillName: string;
  model: string;
}
export interface SSEStepComplete {
  stepIndex: number;
  output: Record<string, string>;
  duration: number;
  tokens: {
    input: number;
    output: number;
  };
  model: string;
  estimatedCost?: number | null;
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
  totalEstimatedCost?: number | null;
}
export interface AuditViolation {
  type: 'mechanical' | 'subjective';
  rule: string;
  sentence: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  explanation?: string;
}
export interface SSEAuditResult {
  stepIndex: number;
  violations: AuditViolation[];
  mechanical: number;
  subjective: number;
  total: number;
}
export interface SSEReworkRound {
  stepIndex: number;
  round: number;
  fixedCount: number;
  remainingCount: number;
  revisedOutput?: string;
}
export interface SSEReworkComplete {
  stepIndex: number;
  rounds: number;
  originalViolations: number;
  remainingViolations: number;
}
export type SSEEvent =
  | {
      type: 'step_start';
      data: SSEStepStart;
    }
  | {
      type: 'step_complete';
      data: SSEStepComplete;
    }
  | {
      type: 'step_error';
      data: SSEStepError;
    }
  | {
      type: 'editor_round';
      data: SSEEditorRound;
    }
  | {
      type: 'editor_approval_needed';
      data: SSEEditorApprovalNeeded;
    }
  | {
      type: 'done';
      data: SSEDone;
    }
  | {
      type: 'audit_result';
      data: SSEAuditResult;
    }
  | {
      type: 'rework_round';
      data: SSEReworkRound;
    }
  | {
      type: 'rework_complete';
      data: SSEReworkComplete;
    };
//# sourceMappingURL=execution.types.d.ts.map
