import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  boolean,
  jsonb,
  integer,
  real,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================
// USERS
// Normal form: 2NF (role as varchar — will migrate to role_id FK in Batch 2)
// ============================================================

// Forward declaration for circular FK reference
// roles table is defined below — roleId FK added after roles table exists

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    googleId: varchar('google_id', { length: 255 }).unique(),
    name: varchar('name', { length: 255 }).notNull(),
    // DEPRECATED: role varchar — kept during migration, will be removed
    role: varchar('role', { length: 50 }).notNull().default('Subscriber'),
    // NEW: proper FK to roles table
    roleId: uuid('role_id'),
    isBlocked: boolean('is_blocked').notNull().default(false),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    freeSessionsLimit: integer('free_sessions_limit').notNull().default(10),
    freeSessionsUsed: integer('free_sessions_used').notNull().default(0),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    subscriptionTier: varchar('subscription_tier', { length: 30 }).notNull().default('free'),
    pendingPlanId: uuid('pending_plan_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_users_role_id').on(t.roleId)],
);

// ============================================================
// REFRESH TOKENS
// Normal form: 2NF
// ============================================================

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    // Index: lookup tokens by user for cleanup
    index('idx_refresh_tokens_user_id').on(t.userId),
  ],
);

// ============================================================
// EMAIL VERIFICATIONS
// Normal form: 2NF
// ============================================================

export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: lookup verification tokens by user for cooldown check and cleanup
    index('idx_email_verifications_user_id').on(t.userId),
  ],
);

// ============================================================
// FLOWS (orchestrations)
// Normal form: 2NF (config JSONB deprecated — use flow_fields + flow_steps)
// ============================================================

export const flows = pgTable(
  'flows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull().default('draft'),
    // DEPRECATED: config JSONB — kept during migration, read from flow_fields + flow_steps
    config: jsonb('config').notNull().default('{"fields":[],"steps":[]}'),
    style: varchar('style', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_flows_user_id').on(t.userId)],
);

// ============================================================
// FLOW FIELDS (normalized from flows.config.fields)
// Normal form: 2NF
// ============================================================

export const flowFields = pgTable(
  'flow_fields',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    fieldId: varchar('field_id', { length: 100 }).notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    placeholder: varchar('placeholder', { length: 255 }),
    isRequired: boolean('is_required').notNull().default(false),
    options: jsonb('options').default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list fields for a flow
    index('idx_flow_fields_flow_id').on(t.flowId),
  ],
);

// ============================================================
// FLOW STEPS (normalized from flows.config.steps)
// Normal form: 2NF (inputMappings/overrides/editorConfig JSONB acceptable — opaque config)
// ============================================================

export const flowSteps = pgTable(
  'flow_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    stepId: varchar('step_id', { length: 100 }).notNull(),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    skillVersion: integer('skill_version'),
    model: varchar('model', { length: 100 }).notNull().default(''),
    provider: varchar('provider', { length: 100 }).notNull().default(''),
    prompt: text('prompt').notNull().default(''),
    capabilities: jsonb('capabilities').notNull().default('[]'),
    inputMappings: jsonb('input_mappings').notNull().default('{}'),
    overrides: jsonb('overrides').default('{}'),
    editorConfig: jsonb('editor_config'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list steps for a flow, lookup by skill
    index('idx_flow_steps_flow_id').on(t.flowId),
    index('idx_flow_steps_skill_id').on(t.skillId),
  ],
);

// ============================================================
// AI PROVIDERS
// Normal form: 1NF — config JSONB contains models + API key (acceptable: provider config is opaque)
// ============================================================

export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  providerType: varchar('provider_type', { length: 50 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  config: jsonb('config').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// SKILLS
// Normal form: 2NF (config JSONB deprecated — use skill_inputs + skill_outputs + scalar columns)
// ============================================================

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    source: varchar('source', { length: 20 }).notNull().default('user'),
    currentVersion: integer('current_version').notNull().default(1),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    icon: varchar('icon', { length: 50 }),
    tags: jsonb('tags').notNull().default('[]'),
    // DEPRECATED: config JSONB — kept during migration
    config: jsonb('config').notNull(),
    // NEW: scalar fields extracted from config
    promptTemplate: text('prompt_template'),
    systemPrompt: text('system_prompt'),
    capabilities: jsonb('capabilities').default('[]'),
    defaultProvider: varchar('default_provider', { length: 100 }),
    defaultModel: varchar('default_model', { length: 100 }),
    temperature: real('temperature'),
    maxTokens: integer('max_tokens'),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_skills_user_id').on(t.userId)],
);

// ============================================================
// SKILL VERSIONS
// Normal form: 1NF — config JSONB mirrors skills.config
// ============================================================

export const skillVersions = pgTable(
  'skill_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    config: jsonb('config').notNull(),
    changelog: text('changelog'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list versions for a skill
    index('idx_skill_versions_skill_id').on(t.skillId),
  ],
);

// ============================================================
// SKILL INPUTS (normalized from skills.config.inputs)
// Normal form: 2NF
// ============================================================

export const skillInputs = pgTable(
  'skill_inputs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    inputId: varchar('input_id', { length: 100 }).notNull(),
    key: varchar('key', { length: 100 }).notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    description: text('description'),
    isRequired: boolean('is_required').notNull().default(false),
    defaultValue: varchar('default_value', { length: 500 }),
    options: jsonb('options').default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_skill_inputs_skill_id').on(t.skillId)],
);

// ============================================================
// SKILL OUTPUTS (normalized from skills.config.outputs)
// Normal form: 2NF
// ============================================================

export const skillOutputs = pgTable(
  'skill_outputs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    description: text('description'),
    isVisible: boolean('is_visible').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_skill_outputs_skill_id').on(t.skillId)],
);

// ============================================================
// ROLES
// Normal form: 1NF — permissions JSONB (will normalize to junction table in Batch 3)
// ============================================================

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: text('description'),
  // DEPRECATED: permissions JSONB — migrating to role_permissions junction table
  permissions: jsonb('permissions').notNull().default('[]'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// PERMISSIONS
// Normal form: 2NF
// ============================================================

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  category: varchar('category', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// ROLE_PERMISSIONS (junction table)
// Normal form: 2NF — composite key on role_id + permission_id
// ============================================================

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: lookup permissions by role, roles by permission
    index('idx_role_permissions_role_id').on(t.roleId),
    index('idx_role_permissions_permission_id').on(t.permissionId),
  ],
);

// ============================================================
// ROLE_USER (junction table — many-to-many users ↔ roles)
// Normal form: 2NF — composite unique on user_id + role_id
// ============================================================

export const roleUser = pgTable(
  'role_user',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: lookup roles by user, users by role
    index('idx_role_user_user_id').on(t.userId),
    index('idx_role_user_role_id').on(t.roleId),
  ],
);

// ============================================================
// SETTINGS
// Normal form: 2NF
// ============================================================

export const settings = pgTable('settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  value: text('value').notNull(),
  isSecret: boolean('is_secret').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// CHANNELS
// Normal form: 2NF (config JSONB is opaque channel config — acceptable)
// ============================================================

export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(),
  icon: varchar('icon', { length: 50 }),
  config: jsonb('config').notNull().default('{}'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// CONTENT ITEMS
// Normal form: 2NF (tags/metadata JSONB are audit — acceptable per CLAUDE.md)
// ============================================================

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    flowId: uuid('flow_id').references(() => flows.id, { onDelete: 'set null' }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 500 }).notNull(),
    body: text('body').notNull(),
    contentType: varchar('content_type', { length: 50 }).notNull().default('markdown'),
    status: varchar('status', { length: 50 }).notNull().default('draft'),
    imageUrl: varchar('image_url', { length: 500 }),
    sourceContentId: uuid('source_content_id'),
    tags: jsonb('tags').notNull().default('[]'),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list content by user, filter by flow, filter by channel
    index('idx_content_items_user_id').on(t.userId),
    index('idx_content_items_flow_id').on(t.flowId),
    index('idx_content_items_channel_id').on(t.channelId),
    // Index: find repurposed posts linked to a parent content item
    index('idx_content_items_source_content_id').on(t.sourceContentId),
  ],
);

// ============================================================
// EXECUTION LOGS (per-step telemetry)
// Normal form: 2NF (skill_id FK + provider_id FK added; varchar columns deprecated)
// ============================================================

export const executionLogs = pgTable(
  'execution_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    // DEPRECATED: skill_name varchar — kept during migration
    skillName: varchar('skill_name', { length: 255 }),
    // NEW: proper FK to skills table
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    model: varchar('model', { length: 255 }).notNull(),
    // DEPRECATED: provider varchar — kept during migration
    provider: varchar('provider', { length: 100 }),
    // NEW: proper FK to ai_providers table
    providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    duration: integer('duration').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull(),
    editorRounds: integer('editor_rounds').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: query logs by flow, by user, by skill, by provider
    index('idx_execution_logs_flow_id').on(t.flowId),
    index('idx_execution_logs_user_id').on(t.userId),
    index('idx_execution_logs_skill_id').on(t.skillId),
    index('idx_execution_logs_provider_id').on(t.providerId),
  ],
);

// ============================================================
// EXECUTION RUNS (per-orchestration run)
// Normal form: 1NF (stepResults JSONB — acceptable: snapshot of run results)
// ============================================================

export const executionRuns = pgTable(
  'execution_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inputs: jsonb('inputs').notNull().default('{}'),
    stepResults: jsonb('step_results').notNull().default('[]'),
    status: varchar('status', { length: 20 }).notNull(),
    totalDuration: integer('total_duration').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list runs by flow, by user
    index('idx_execution_runs_flow_id').on(t.flowId),
    index('idx_execution_runs_user_id').on(t.userId),
  ],
);

// ============================================================
// USER PROFILES
// Normal form: 2NF
// ============================================================

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 100 }).notNull().default(''),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  brandName: varchar('brand_name', { length: 200 }),
  brandVoice: text('brand_voice'),
  targetAudience: text('target_audience'),
  keyMessaging: text('key_messaging'),
  defaultModel: varchar('default_model', { length: 100 }),
  defaultEditorModel: varchar('default_editor_model', { length: 100 }),
  defaultEditorMaxRounds: integer('default_editor_max_rounds').notNull().default(3),
  defaultEditorApprovalMode: varchar('default_editor_approval_mode', { length: 10 })
    .notNull()
    .default('auto'),
  timezone: varchar('timezone', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// USER RULES (global writing rules injected into AI calls)
// Normal form: 2NF
// ============================================================

export const userRules = pgTable(
  'user_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    rules: text('rules').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    category: varchar('category', { length: 20 }).notNull().default('custom'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list rules by user
    index('idx_user_rules_user_id').on(t.userId),
  ],
);

// ============================================================
// SOCIAL ACCOUNTS (placeholder for OAuth integrations)
// Normal form: 2NF (metadata JSONB is audit — acceptable per CLAUDE.md)
// ============================================================

export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 30 }).notNull(),
    accountType: varchar('account_type', { length: 30 }).notNull().default('personal'),
    label: varchar('label', { length: 100 }),
    accountName: varchar('account_name', { length: 255 }),
    accountId: varchar('account_id', { length: 255 }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    isConnected: boolean('is_connected').notNull().default(false),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list social accounts by user
    index('idx_social_accounts_user_id').on(t.userId),
    // Unique: one connection per user + platform + account (supports multi-account)
    uniqueIndex('idx_social_accounts_user_platform_account').on(t.userId, t.platform, t.accountId),
  ],
);

// ============================================================
// PENDING APPROVALS (DB-backed editor approval polling)
// Normal form: 2NF
// ============================================================

export const pendingApprovals = pgTable(
  'pending_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    round: integer('round').notNull(),
    generatorOutput: text('generator_output').notNull(),
    editorFeedback: text('editor_feedback').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    userAction: varchar('user_action', { length: 20 }),
    userFeedback: text('user_feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: poll by flow+user+status
    index('idx_pending_approvals_flow_id').on(t.flowId),
    index('idx_pending_approvals_user_id').on(t.userId),
  ],
);

// ============================================================
// CONVERSATIONS (AI chat)
// Normal form: 2NF
// ============================================================

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull().default('New Chat'),
    model: varchar('model', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list conversations by user sorted by date
    index('idx_conversations_user_id').on(t.userId),
  ],
);

// ============================================================
// MESSAGES (chat messages)
// Normal form: 2NF
// ============================================================

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    contentType: varchar('content_type', { length: 20 }).notNull().default('text'),
    model: varchar('model', { length: 100 }),
    tokens: integer('tokens').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list messages by conversation
    index('idx_messages_conversation_id').on(t.conversationId),
  ],
);

// ============================================================
// PROMPTS (user prompt library)
// Normal form: 2NF
// ============================================================

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    body: text('body').notNull(),
    defaultModel: varchar('default_model', { length: 100 }),
    category: varchar('category', { length: 50 }).notNull().default('custom'),
    isActive: boolean('is_active').notNull().default(true),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list prompts by user
    index('idx_prompts_user_id').on(t.userId),
  ],
);

// ============================================================
// PROMPT VERSIONS (version history for prompts — append-only)
// Normal form: 2NF
// ============================================================

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    defaultModel: varchar('default_model', { length: 100 }),
    changelog: text('changelog'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list versions for a prompt
    index('idx_prompt_versions_prompt_id').on(t.promptId),
    // Unique: one version number per prompt
    uniqueIndex('idx_prompt_versions_prompt_version').on(t.promptId, t.version),
  ],
);

// ============================================================
// SCHEDULED POSTS (content scheduling for publishing)
// Normal form: 2NF
// ============================================================

export const scheduledPosts = pgTable(
  'scheduled_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    socialAccountId: uuid('social_account_id').references(() => socialAccounts.id, {
      onDelete: 'set null',
    }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list scheduled posts by user
    index('idx_scheduled_posts_user_id').on(t.userId),
    // Index: lookup by content item
    index('idx_scheduled_posts_content_item_id').on(t.contentItemId),
    // Index: lookup by channel
    index('idx_scheduled_posts_channel_id').on(t.channelId),
    // Index: lookup by social account
    index('idx_scheduled_posts_social_account_id').on(t.socialAccountId),
    // Composite: cron job polls for due posts (WHERE status='pending' AND scheduled_at <= now)
    index('idx_scheduled_posts_status_scheduled_at').on(t.status, t.scheduledAt),
  ],
);

// ============================================================
// SYSTEM PROMPTS (platform-level prompts used by AI features)
// Normal form: 2NF
// ============================================================

export const systemPrompts = pgTable('system_prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  body: text('body').notNull(),
  category: varchar('category', { length: 50 }).notNull().default('general'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// OLAP: DIMENSION — MODEL PRICING
// Normal form: 2NF (dimension table for star schema)
// ============================================================

export const dimModels = pgTable('dim_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  modelId: varchar('model_id', { length: 150 }).notNull().unique(),
  provider: varchar('provider', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  inputCostPerM: real('input_cost_per_m').notNull().default(0),
  outputCostPerM: real('output_cost_per_m').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// OLAP: FACT — USAGE AGGREGATES
// Normal form: Star schema fact table
// Grain: one row per (user, model, flow, date, source)
// ============================================================

export const factUsage = pgTable(
  'fact_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    modelId: uuid('model_id')
      .notNull()
      .references(() => dimModels.id, { onDelete: 'cascade' }),
    flowId: uuid('flow_id').references(() => flows.id, { onDelete: 'set null' }),
    usageDate: date('usage_date', { mode: 'string' }).notNull(),
    source: varchar('source', { length: 20 }).notNull(),
    totalInputTokens: integer('total_input_tokens').notNull().default(0),
    totalOutputTokens: integer('total_output_tokens').notNull().default(0),
    totalCost: real('total_cost').notNull().default(0),
    requestCount: integer('request_count').notNull().default(0),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: query by user for per-user dashboards
    index('idx_fact_usage_user_id').on(t.userId),
    // Index: query by model for model breakdown
    index('idx_fact_usage_model_id').on(t.modelId),
    // Index: query by date range for timeseries
    index('idx_fact_usage_date').on(t.usageDate),
    // Unique constraint: one row per grain combination
    uniqueIndex('idx_fact_usage_grain').on(t.userId, t.modelId, t.flowId, t.usageDate, t.source),
  ],
);

// ============================================================
// SUBSCRIPTION PLANS (tier definitions)
// Normal form: 2NF (features JSONB is display-only list — acceptable)
// OLTP table
// ============================================================

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('usd'),
  creditsPerMonth: integer('credits_per_month').notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  features: jsonb('features').notNull().default('[]'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// SUBSCRIPTIONS (user subscription state)
// Normal form: 2NF
// OLTP table
// ============================================================

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).unique(),
    status: varchar('status', { length: 30 }).notNull().default('active'),
    creditsRemaining: integer('credits_remaining').notNull().default(0),
    creditsAllocated: integer('credits_allocated').notNull().default(0),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: lookup subscription by Stripe customer
    index('idx_subscriptions_stripe_customer_id').on(t.stripeCustomerId),
    // Index: lookup by plan for analytics
    index('idx_subscriptions_plan_id').on(t.planId),
  ],
);

// ============================================================
// CREDIT TRANSACTIONS (audit log of every credit change)
// Normal form: 2NF (metadata JSONB is audit — acceptable per CLAUDE.md)
// OLTP table
// ============================================================

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    actionType: varchar('action_type', { length: 30 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: usage dashboard queries (user + date descending)
    index('idx_credit_transactions_user_id').on(t.userId),
    // Index: lookup transactions by subscription
    index('idx_credit_transactions_subscription_id').on(t.subscriptionId),
  ],
);

// ============================================================
// CREDIT COSTS (admin-configurable credit pricing per action type)
// Normal form: 2NF
// OLTP table
// ============================================================

export const creditCosts = pgTable('credit_costs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actionType: varchar('action_type', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  baseCost: integer('base_cost').notNull().default(1),
  premiumMultiplier: numeric('premium_multiplier', { precision: 4, scale: 2 })
    .notNull()
    .default('1.00'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// EMAIL TEMPLATES (admin-editable email templates)
// Normal form: 2NF (variables JSONB is a display-only list — acceptable)
// OLTP table
// ============================================================

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: varchar('event_type', { length: 50 }).notNull().unique(),
  subject: varchar('subject', { length: 255 }).notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text').notNull(),
  variables: jsonb('variables').notNull().default('[]'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// WEBHOOK EVENTS (Stripe webhook idempotency tracking)
// Normal form: 2NF
// OLTP table
// ============================================================

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  stripeEventId: varchar('stripe_event_id', { length: 255 }).notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
