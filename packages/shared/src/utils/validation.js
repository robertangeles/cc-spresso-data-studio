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
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
    description: z.string().min(1, 'Description is required').max(1000),
    category: z.enum(['repurpose', 'generate', 'research', 'transform', 'extract', 'plan']),
    icon: z.string().max(50).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    config: z.object({
        inputs: z.array(z.object({
            id: z.string(),
            key: z.string(),
            type: z.enum(['text', 'multiline', 'document', 'image', 'select']),
            label: z.string(),
            description: z.string().optional(),
            required: z.boolean(),
            defaultValue: z.string().optional(),
            options: z.array(z.string()).optional(),
        })),
        outputs: z.array(z.object({
            key: z.string(),
            type: z.enum(['text', 'markdown', 'json', 'image_url']),
            label: z.string(),
            description: z.string().optional(),
            visible: z.boolean().optional(),
        })),
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
    category: z.enum(['repurpose', 'generate', 'research', 'transform', 'extract', 'plan']).optional(),
    icon: z.string().max(50).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    config: createSkillSchema.shape.config.optional(),
    isPublished: z.boolean().optional(),
    changelog: z.string().max(500).optional(),
});
export const executeFlowSchema = z.object({
    inputs: z.record(z.string()),
});
// --- Role validation ---
export const createRoleSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50).regex(/^[a-zA-Z ]+$/, 'Name must contain only letters and spaces'),
    description: z.string().max(500).optional(),
    permissions: z.array(z.string().max(100)).max(50).optional(),
});
export const updateRoleSchema = z.object({
    name: z.string().min(1).max(50).regex(/^[a-zA-Z ]+$/, 'Name must contain only letters and spaces').optional(),
    description: z.string().max(500).optional(),
    permissions: z.array(z.string().max(100)).max(50).optional(),
});
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
//# sourceMappingURL=validation.js.map