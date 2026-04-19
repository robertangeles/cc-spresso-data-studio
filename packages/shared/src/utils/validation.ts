import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  turnstileToken: z.string().optional(),
  planId: z.string().uuid().optional(),
});

export const createFlowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
});

export const updateFlowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  config: z
    .object({
      fields: z.array(z.any()),
      steps: z.array(z.any()),
      style: z.string().optional(),
    })
    .optional(),
});

export const executeQuerySchema = z.object({
  sql: z.string().min(1, 'SQL query is required').max(10000, 'Query too long'),
  mode: z.enum(['read', 'write']).default('read'),
});

export const createSkillSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  description: z.string().min(1, 'Description is required').max(1000),
  category: z.enum(['repurpose', 'generate', 'research', 'transform', 'extract', 'plan']),
  icon: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  config: z.object({
    inputs: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        type: z.enum(['text', 'multiline', 'document', 'image', 'select']),
        label: z.string(),
        description: z.string().optional(),
        required: z.boolean(),
        defaultValue: z.string().optional(),
        options: z.array(z.string()).optional(),
      }),
    ),
    outputs: z.array(
      z.object({
        key: z.string(),
        type: z.enum(['text', 'markdown', 'json', 'image_url']),
        label: z.string(),
        description: z.string().optional(),
        visible: z.boolean().optional(),
      }),
    ),
    promptTemplate: z.string().min(1, 'Prompt template is required').max(50000),
    systemPrompt: z.string().max(10000).optional(),
    capabilities: z.array(z.enum(['research', 'image_gen', 'image_proc', 'documents'])),
    defaultProvider: z.string().optional(),
    defaultModel: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
  }),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  category: z
    .enum(['repurpose', 'generate', 'research', 'transform', 'extract', 'plan'])
    .optional(),
  icon: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  config: createSkillSchema.shape.config.optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  showPrompts: z.boolean().optional(),
  changelog: z.string().max(500).optional(),
});

export const updateVisibilitySchema = z.object({
  visibility: z.enum(['private', 'unlisted', 'public']),
});

export const executeFlowSchema = z.object({
  inputs: z.record(z.string()),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateFlowInput = z.infer<typeof createFlowSchema>;
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>;
export type ExecuteQueryInput = z.infer<typeof executeQuerySchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type UpdateVisibilityInput = z.infer<typeof updateVisibilitySchema>;
export type ExecuteFlowInput = z.infer<typeof executeFlowSchema>;

// --- Role validation ---

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(50)
    .regex(/^[a-zA-Z ]+$/, 'Name must contain only letters and spaces'),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().max(100)).max(50).optional(),
});

export const updateRoleSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z ]+$/, 'Name must contain only letters and spaces')
    .optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().max(100)).max(50).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// --- User Rules ---

export const createRuleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  rules: z.string().min(1, 'Rules content is required').max(10000),
  category: z.enum(['writing', 'formatting', 'brand', 'custom']),
});

export const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rules: z.string().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
  category: z.enum(['writing', 'formatting', 'brand', 'custom']).optional(),
});

// --- User Profile ---

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
  brandName: z.string().max(200).optional(),
  brandVoice: z.string().max(2000).optional(),
  targetAudience: z.string().max(2000).optional(),
  keyMessaging: z.string().max(5000).optional(),
  defaultModel: z.string().max(100).optional(),
  defaultEditorModel: z.string().max(100).optional(),
  defaultEditorMaxRounds: z.number().min(1).max(10).optional(),
  defaultEditorApprovalMode: z.enum(['auto', 'manual']).optional(),
  timezone: z.string().max(50).optional(),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ── Projects + Kanban ──────────────────────────────────────

const clientContactSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  role: z.string().max(100).optional(),
});

export const createProjectSchema = z
  .object({
    name: z.string().min(1, 'Project name is required').max(255),
    description: z.string().max(5000).optional(),
    // Foreign keys — nullable so callers can pass null explicitly to unlink.
    organisationId: z.string().uuid().nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
    // Legacy denormalised string; retained for backwards compatibility with
    // existing callers. New UIs should use clientId instead.
    clientName: z.string().max(255).optional(),
    clientContacts: z.array(clientContactSchema).max(20).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: z.enum(['active', 'archived', 'completed']).optional(),
    // Foreign keys — pass `null` to unlink, a uuid string to re-link.
    // `.strict()` on the whole object means any unknown field now returns
    // 400 with field-level details instead of silently dropping — that's
    // what let the client_id field slip through before (traced 2026-04-19).
    organisationId: z.string().uuid().nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
    clientName: z.string().max(255).nullable().optional(),
    clientContacts: z.array(clientContactSchema).max(20).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  })
  .strict();

export const createColumnSchema = z.object({
  name: z.string().min(1, 'Column name is required').max(255),
  color: z.string().max(50).optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z.string().max(50).nullable().optional(),
});

export const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().min(1, 'Card title is required').max(255),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  flowId: z.string().uuid().optional(),
  contentItemId: z.string().uuid().optional(),
});

export const updateCardSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  flowId: z.string().uuid().nullable().optional(),
  contentItemId: z.string().uuid().nullable().optional(),
});

export const moveCardSchema = z.object({
  columnId: z.string().uuid(),
  sortOrder: z.number().int().min(0),
});

export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;

// ── Card Comments + Attachments ────────────────────────────

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
});

export const createAttachmentSchema = z.object({
  type: z.enum(['image', 'file', 'link']),
  url: z.string().url().max(2000),
  fileName: z.string().max(255).optional(),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
