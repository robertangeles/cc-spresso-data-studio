import type { z } from 'zod';
export declare const loginSchema: z.ZodObject<
  {
    email: z.ZodString;
    password: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    email: string;
    password: string;
  },
  {
    email: string;
    password: string;
  }
>;
export declare const registerSchema: z.ZodObject<
  {
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    email: string;
    name: string;
    password: string;
  },
  {
    email: string;
    name: string;
    password: string;
  }
>;
export declare const createFlowSchema: z.ZodObject<
  {
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    description?: string | undefined;
  },
  {
    name: string;
    description?: string | undefined;
  }
>;
export declare const updateFlowSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<['draft', 'published', 'archived']>>;
    config: z.ZodOptional<
      z.ZodObject<
        {
          fields: z.ZodArray<z.ZodAny, 'many'>;
          steps: z.ZodArray<z.ZodAny, 'many'>;
          style: z.ZodOptional<z.ZodString>;
        },
        'strip',
        z.ZodTypeAny,
        {
          fields: any[];
          steps: any[];
          style?: string | undefined;
        },
        {
          fields: any[];
          steps: any[];
          style?: string | undefined;
        }
      >
    >;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    status?: 'draft' | 'published' | 'archived' | undefined;
    description?: string | null | undefined;
    config?:
      | {
          fields: any[];
          steps: any[];
          style?: string | undefined;
        }
      | undefined;
  },
  {
    name?: string | undefined;
    status?: 'draft' | 'published' | 'archived' | undefined;
    description?: string | null | undefined;
    config?:
      | {
          fields: any[];
          steps: any[];
          style?: string | undefined;
        }
      | undefined;
  }
>;
export declare const executeQuerySchema: z.ZodObject<
  {
    sql: z.ZodString;
    mode: z.ZodDefault<z.ZodEnum<['read', 'write']>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    sql: string;
    mode: 'read' | 'write';
  },
  {
    sql: string;
    mode?: 'read' | 'write' | undefined;
  }
>;
export declare const createSkillSchema: z.ZodObject<
  {
    name: z.ZodString;
    slug: z.ZodString;
    description: z.ZodString;
    category: z.ZodEnum<['repurpose', 'generate', 'research', 'transform', 'extract', 'plan']>;
    icon: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    config: z.ZodObject<
      {
        inputs: z.ZodArray<
          z.ZodObject<
            {
              id: z.ZodString;
              key: z.ZodString;
              type: z.ZodEnum<['text', 'multiline', 'document', 'image', 'select']>;
              label: z.ZodString;
              description: z.ZodOptional<z.ZodString>;
              required: z.ZodBoolean;
              defaultValue: z.ZodOptional<z.ZodString>;
              options: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
            },
            'strip',
            z.ZodTypeAny,
            {
              id: string;
              type: 'text' | 'image' | 'multiline' | 'document' | 'select';
              key: string;
              label: string;
              required: boolean;
              options?: string[] | undefined;
              description?: string | undefined;
              defaultValue?: string | undefined;
            },
            {
              id: string;
              type: 'text' | 'image' | 'multiline' | 'document' | 'select';
              key: string;
              label: string;
              required: boolean;
              options?: string[] | undefined;
              description?: string | undefined;
              defaultValue?: string | undefined;
            }
          >,
          'many'
        >;
        outputs: z.ZodArray<
          z.ZodObject<
            {
              key: z.ZodString;
              type: z.ZodEnum<['text', 'markdown', 'json', 'image_url']>;
              label: z.ZodString;
              description: z.ZodOptional<z.ZodString>;
              visible: z.ZodOptional<z.ZodBoolean>;
            },
            'strip',
            z.ZodTypeAny,
            {
              type: 'text' | 'image_url' | 'markdown' | 'json';
              key: string;
              label: string;
              description?: string | undefined;
              visible?: boolean | undefined;
            },
            {
              type: 'text' | 'image_url' | 'markdown' | 'json';
              key: string;
              label: string;
              description?: string | undefined;
              visible?: boolean | undefined;
            }
          >,
          'many'
        >;
        promptTemplate: z.ZodString;
        systemPrompt: z.ZodOptional<z.ZodString>;
        capabilities: z.ZodArray<
          z.ZodEnum<['research', 'image_gen', 'image_proc', 'documents']>,
          'many'
        >;
        defaultProvider: z.ZodOptional<z.ZodString>;
        defaultModel: z.ZodOptional<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
      },
      'strip',
      z.ZodTypeAny,
      {
        inputs: {
          id: string;
          type: 'text' | 'image' | 'multiline' | 'document' | 'select';
          key: string;
          label: string;
          required: boolean;
          options?: string[] | undefined;
          description?: string | undefined;
          defaultValue?: string | undefined;
        }[];
        outputs: {
          type: 'text' | 'image_url' | 'markdown' | 'json';
          key: string;
          label: string;
          description?: string | undefined;
          visible?: boolean | undefined;
        }[];
        promptTemplate: string;
        capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
        systemPrompt?: string | undefined;
        defaultProvider?: string | undefined;
        defaultModel?: string | undefined;
        temperature?: number | undefined;
        maxTokens?: number | undefined;
      },
      {
        inputs: {
          id: string;
          type: 'text' | 'image' | 'multiline' | 'document' | 'select';
          key: string;
          label: string;
          required: boolean;
          options?: string[] | undefined;
          description?: string | undefined;
          defaultValue?: string | undefined;
        }[];
        outputs: {
          type: 'text' | 'image_url' | 'markdown' | 'json';
          key: string;
          label: string;
          description?: string | undefined;
          visible?: boolean | undefined;
        }[];
        promptTemplate: string;
        capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
        systemPrompt?: string | undefined;
        defaultProvider?: string | undefined;
        defaultModel?: string | undefined;
        temperature?: number | undefined;
        maxTokens?: number | undefined;
      }
    >;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    description: string;
    config: {
      inputs: {
        id: string;
        type: 'text' | 'image' | 'multiline' | 'document' | 'select';
        key: string;
        label: string;
        required: boolean;
        options?: string[] | undefined;
        description?: string | undefined;
        defaultValue?: string | undefined;
      }[];
      outputs: {
        type: 'text' | 'image_url' | 'markdown' | 'json';
        key: string;
        label: string;
        description?: string | undefined;
        visible?: boolean | undefined;
      }[];
      promptTemplate: string;
      capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
      systemPrompt?: string | undefined;
      defaultProvider?: string | undefined;
      defaultModel?: string | undefined;
      temperature?: number | undefined;
      maxTokens?: number | undefined;
    };
    slug: string;
    category: 'research' | 'repurpose' | 'generate' | 'transform' | 'extract' | 'plan';
    icon?: string | undefined;
    tags?: string[] | undefined;
  },
  {
    name: string;
    description: string;
    config: {
      inputs: {
        id: string;
        type: 'text' | 'image' | 'multiline' | 'document' | 'select';
        key: string;
        label: string;
        required: boolean;
        options?: string[] | undefined;
        description?: string | undefined;
        defaultValue?: string | undefined;
      }[];
      outputs: {
        type: 'text' | 'image_url' | 'markdown' | 'json';
        key: string;
        label: string;
        description?: string | undefined;
        visible?: boolean | undefined;
      }[];
      promptTemplate: string;
      capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
      systemPrompt?: string | undefined;
      defaultProvider?: string | undefined;
      defaultModel?: string | undefined;
      temperature?: number | undefined;
      maxTokens?: number | undefined;
    };
    slug: string;
    category: 'research' | 'repurpose' | 'generate' | 'transform' | 'extract' | 'plan';
    icon?: string | undefined;
    tags?: string[] | undefined;
  }
>;
export declare const updateSkillSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<
      z.ZodEnum<['repurpose', 'generate', 'research', 'transform', 'extract', 'plan']>
    >;
    icon: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    config: z.ZodOptional<
      z.ZodObject<
        {
          inputs: z.ZodArray<
            z.ZodObject<
              {
                id: z.ZodString;
                key: z.ZodString;
                type: z.ZodEnum<['text', 'multiline', 'document', 'image', 'select']>;
                label: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                required: z.ZodBoolean;
                defaultValue: z.ZodOptional<z.ZodString>;
                options: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                id: string;
                type: 'text' | 'image' | 'multiline' | 'document' | 'select';
                key: string;
                label: string;
                required: boolean;
                options?: string[] | undefined;
                description?: string | undefined;
                defaultValue?: string | undefined;
              },
              {
                id: string;
                type: 'text' | 'image' | 'multiline' | 'document' | 'select';
                key: string;
                label: string;
                required: boolean;
                options?: string[] | undefined;
                description?: string | undefined;
                defaultValue?: string | undefined;
              }
            >,
            'many'
          >;
          outputs: z.ZodArray<
            z.ZodObject<
              {
                key: z.ZodString;
                type: z.ZodEnum<['text', 'markdown', 'json', 'image_url']>;
                label: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                visible: z.ZodOptional<z.ZodBoolean>;
              },
              'strip',
              z.ZodTypeAny,
              {
                type: 'text' | 'image_url' | 'markdown' | 'json';
                key: string;
                label: string;
                description?: string | undefined;
                visible?: boolean | undefined;
              },
              {
                type: 'text' | 'image_url' | 'markdown' | 'json';
                key: string;
                label: string;
                description?: string | undefined;
                visible?: boolean | undefined;
              }
            >,
            'many'
          >;
          promptTemplate: z.ZodString;
          systemPrompt: z.ZodOptional<z.ZodString>;
          capabilities: z.ZodArray<
            z.ZodEnum<['research', 'image_gen', 'image_proc', 'documents']>,
            'many'
          >;
          defaultProvider: z.ZodOptional<z.ZodString>;
          defaultModel: z.ZodOptional<z.ZodString>;
          temperature: z.ZodOptional<z.ZodNumber>;
          maxTokens: z.ZodOptional<z.ZodNumber>;
        },
        'strip',
        z.ZodTypeAny,
        {
          inputs: {
            id: string;
            type: 'text' | 'image' | 'multiline' | 'document' | 'select';
            key: string;
            label: string;
            required: boolean;
            options?: string[] | undefined;
            description?: string | undefined;
            defaultValue?: string | undefined;
          }[];
          outputs: {
            type: 'text' | 'image_url' | 'markdown' | 'json';
            key: string;
            label: string;
            description?: string | undefined;
            visible?: boolean | undefined;
          }[];
          promptTemplate: string;
          capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
          systemPrompt?: string | undefined;
          defaultProvider?: string | undefined;
          defaultModel?: string | undefined;
          temperature?: number | undefined;
          maxTokens?: number | undefined;
        },
        {
          inputs: {
            id: string;
            type: 'text' | 'image' | 'multiline' | 'document' | 'select';
            key: string;
            label: string;
            required: boolean;
            options?: string[] | undefined;
            description?: string | undefined;
            defaultValue?: string | undefined;
          }[];
          outputs: {
            type: 'text' | 'image_url' | 'markdown' | 'json';
            key: string;
            label: string;
            description?: string | undefined;
            visible?: boolean | undefined;
          }[];
          promptTemplate: string;
          capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
          systemPrompt?: string | undefined;
          defaultProvider?: string | undefined;
          defaultModel?: string | undefined;
          temperature?: number | undefined;
          maxTokens?: number | undefined;
        }
      >
    >;
    isPublished: z.ZodOptional<z.ZodBoolean>;
    changelog: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    description?: string | undefined;
    config?:
      | {
          inputs: {
            id: string;
            type: 'text' | 'image' | 'multiline' | 'document' | 'select';
            key: string;
            label: string;
            required: boolean;
            options?: string[] | undefined;
            description?: string | undefined;
            defaultValue?: string | undefined;
          }[];
          outputs: {
            type: 'text' | 'image_url' | 'markdown' | 'json';
            key: string;
            label: string;
            description?: string | undefined;
            visible?: boolean | undefined;
          }[];
          promptTemplate: string;
          capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
          systemPrompt?: string | undefined;
          defaultProvider?: string | undefined;
          defaultModel?: string | undefined;
          temperature?: number | undefined;
          maxTokens?: number | undefined;
        }
      | undefined;
    category?: 'research' | 'repurpose' | 'generate' | 'transform' | 'extract' | 'plan' | undefined;
    icon?: string | undefined;
    tags?: string[] | undefined;
    isPublished?: boolean | undefined;
    changelog?: string | undefined;
  },
  {
    name?: string | undefined;
    description?: string | undefined;
    config?:
      | {
          inputs: {
            id: string;
            type: 'text' | 'image' | 'multiline' | 'document' | 'select';
            key: string;
            label: string;
            required: boolean;
            options?: string[] | undefined;
            description?: string | undefined;
            defaultValue?: string | undefined;
          }[];
          outputs: {
            type: 'text' | 'image_url' | 'markdown' | 'json';
            key: string;
            label: string;
            description?: string | undefined;
            visible?: boolean | undefined;
          }[];
          promptTemplate: string;
          capabilities: ('research' | 'image_gen' | 'image_proc' | 'documents')[];
          systemPrompt?: string | undefined;
          defaultProvider?: string | undefined;
          defaultModel?: string | undefined;
          temperature?: number | undefined;
          maxTokens?: number | undefined;
        }
      | undefined;
    category?: 'research' | 'repurpose' | 'generate' | 'transform' | 'extract' | 'plan' | undefined;
    icon?: string | undefined;
    tags?: string[] | undefined;
    isPublished?: boolean | undefined;
    changelog?: string | undefined;
  }
>;
export declare const executeFlowSchema: z.ZodObject<
  {
    inputs: z.ZodRecord<z.ZodString, z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    inputs: Record<string, string>;
  },
  {
    inputs: Record<string, string>;
  }
>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateFlowInput = z.infer<typeof createFlowSchema>;
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>;
export type ExecuteQueryInput = z.infer<typeof executeQuerySchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type ExecuteFlowInput = z.infer<typeof executeFlowSchema>;
export declare const createRoleSchema: z.ZodObject<
  {
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    description?: string | undefined;
    permissions?: string[] | undefined;
  },
  {
    name: string;
    description?: string | undefined;
    permissions?: string[] | undefined;
  }
>;
export declare const updateRoleSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    description?: string | undefined;
    permissions?: string[] | undefined;
  },
  {
    name?: string | undefined;
    description?: string | undefined;
    permissions?: string[] | undefined;
  }
>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export declare const createRuleSchema: z.ZodObject<
  {
    name: z.ZodString;
    rules: z.ZodString;
    category: z.ZodEnum<['writing', 'formatting', 'brand', 'custom']>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    category: 'writing' | 'formatting' | 'brand' | 'custom';
    rules: string;
  },
  {
    name: string;
    category: 'writing' | 'formatting' | 'brand' | 'custom';
    rules: string;
  }
>;
export declare const updateRuleSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    rules: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    category: z.ZodOptional<z.ZodEnum<['writing', 'formatting', 'brand', 'custom']>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    category?: 'writing' | 'formatting' | 'brand' | 'custom' | undefined;
    rules?: string | undefined;
    isActive?: boolean | undefined;
  },
  {
    name?: string | undefined;
    category?: 'writing' | 'formatting' | 'brand' | 'custom' | undefined;
    rules?: string | undefined;
    isActive?: boolean | undefined;
  }
>;
export declare const updateProfileSchema: z.ZodObject<
  {
    displayName: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    avatarUrl: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<''>]>;
    brandName: z.ZodOptional<z.ZodString>;
    brandVoice: z.ZodOptional<z.ZodString>;
    targetAudience: z.ZodOptional<z.ZodString>;
    keyMessaging: z.ZodOptional<z.ZodString>;
    defaultModel: z.ZodOptional<z.ZodString>;
    defaultEditorModel: z.ZodOptional<z.ZodString>;
    defaultEditorMaxRounds: z.ZodOptional<z.ZodNumber>;
    defaultEditorApprovalMode: z.ZodOptional<z.ZodEnum<['auto', 'manual']>>;
    timezone: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    defaultModel?: string | undefined;
    displayName?: string | undefined;
    bio?: string | undefined;
    avatarUrl?: string | undefined;
    brandName?: string | undefined;
    brandVoice?: string | undefined;
    targetAudience?: string | undefined;
    keyMessaging?: string | undefined;
    defaultEditorModel?: string | undefined;
    defaultEditorMaxRounds?: number | undefined;
    defaultEditorApprovalMode?: 'auto' | 'manual' | undefined;
    timezone?: string | undefined;
  },
  {
    defaultModel?: string | undefined;
    displayName?: string | undefined;
    bio?: string | undefined;
    avatarUrl?: string | undefined;
    brandName?: string | undefined;
    brandVoice?: string | undefined;
    targetAudience?: string | undefined;
    keyMessaging?: string | undefined;
    defaultEditorModel?: string | undefined;
    defaultEditorMaxRounds?: number | undefined;
    defaultEditorApprovalMode?: 'auto' | 'manual' | undefined;
    timezone?: string | undefined;
  }
>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
//# sourceMappingURL=validation.d.ts.map
