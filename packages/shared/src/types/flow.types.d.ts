export type FlowStatus = 'draft' | 'published' | 'archived';
export interface FlowField {
  id: string;
  type: 'text' | 'image' | 'dropdown' | 'multiline' | 'document';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}
export interface EditorConfig {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxRounds: number;
  approvalMode: 'auto' | 'manual';
}
export interface FlowStep {
  id: string;
  skillId?: string;
  skillVersion?: number;
  inputMappings?: Record<string, string>;
  overrides?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  editor?: EditorConfig;
  provider: string;
  model: string;
  prompt: string;
  capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
  order: number;
}
export interface FlowConfig {
  fields: FlowField[];
  steps: FlowStep[];
  style?: string;
}
export interface Flow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: FlowStatus;
  config: FlowConfig;
  createdAt: Date;
  updatedAt: Date;
}
export interface CreateFlowDTO {
  name: string;
  description?: string;
}
export interface UpdateFlowDTO {
  name?: string;
  description?: string;
  status?: FlowStatus;
  config?: FlowConfig;
}
//# sourceMappingURL=flow.types.d.ts.map
