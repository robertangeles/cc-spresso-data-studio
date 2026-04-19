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
  vector,
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
    projectId: uuid('project_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_flows_user_id').on(t.userId), index('idx_flows_project_id').on(t.projectId)],
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
    slug: varchar('slug', { length: 100 }).notNull(),
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
    // Scalar fields extracted from config
    promptTemplate: text('prompt_template'),
    systemPrompt: text('system_prompt'),
    capabilities: jsonb('capabilities').default('[]'),
    defaultProvider: varchar('default_provider', { length: 100 }),
    defaultModel: varchar('default_model', { length: 100 }),
    temperature: real('temperature'),
    maxTokens: integer('max_tokens'),
    // Marketplace: visibility replaces isPublished
    visibility: varchar('visibility', { length: 20 }).notNull().default('private'),
    showPrompts: boolean('show_prompts').notNull().default(false),
    forkedFromId: uuid('forked_from_id'),
    usageCount: integer('usage_count').notNull().default(0),
    favoriteCount: integer('favorite_count').notNull().default(0),
    forkCount: integer('fork_count').notNull().default(0),
    creatorDisplayName: varchar('creator_display_name', { length: 255 }),
    creatorAvatarUrl: varchar('creator_avatar_url', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: lookup skills by owner
    index('idx_skills_user_id').on(t.userId),
    // Index: community listing — only public skills
    index('idx_skills_visibility').on(t.visibility),
    // Index: trending sort by usage
    index('idx_skills_usage_count').on(t.usageCount),
    // Index: fork lineage
    index('idx_skills_forked_from').on(t.forkedFromId),
    // Unique: slug scoped to user (namespace isolation)
    uniqueIndex('idx_skills_user_slug').on(t.userId, t.slug),
  ],
);

// ============================================================
// SKILL FAVORITES (junction: users bookmarking community skills)
// Normal form: 2NF
// ============================================================

export const skillFavorites = pgTable(
  'skill_favorites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one favorite per user per skill
    uniqueIndex('idx_skill_favorites_user_skill').on(t.userId, t.skillId),
    // Index: count favorites for a skill
    index('idx_skill_favorites_skill_id').on(t.skillId),
  ],
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
    videoUrl: varchar('video_url', { length: 500 }),
    sourceContentId: uuid('source_content_id'),
    projectId: uuid('project_id'),
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
    index('idx_content_items_project_id').on(t.projectId),
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
  // Tax / billing identity — synced to Stripe customer for invoices
  taxId: varchar('tax_id', { length: 50 }),
  taxIdType: varchar('tax_id_type', { length: 20 }), // Stripe tax ID type: au_abn, eu_vat, gb_vat, us_ein, etc.
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
    metadata: jsonb('metadata').notNull().default('{}'),
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

// ============================================================
// COMMUNITY CHANNELS
// Normal form: 2NF
// OLTP table
// ============================================================

export const communityChannels = pgTable(
  'community_channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    type: varchar('type', { length: 20 }).notNull().default('text'),
    isDefault: boolean('is_default').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list channels sorted
    index('idx_community_channels_sort_order').on(t.sortOrder),
  ],
);

// ============================================================
// COMMUNITY MESSAGES
// Normal form: 2NF
// OLTP table
// ============================================================

export const communityMessages = pgTable(
  'community_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => communityChannels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    type: varchar('type', { length: 20 }).notNull().default('text'),
    parentId: uuid('parent_id'),
    isEdited: boolean('is_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list messages by channel
    index('idx_community_messages_channel_id').on(t.channelId),
    // Index: list messages by user
    index('idx_community_messages_user_id').on(t.userId),
    // Index: paginated message history by channel + time
    index('idx_community_messages_channel_created').on(t.channelId, t.createdAt),
  ],
);

// ============================================================
// COMMUNITY MESSAGE ATTACHMENTS (images, link previews)
// Normal form: 2NF (metadata JSONB is OG data — acceptable per CLAUDE.md)
// OLTP table
// ============================================================

export const communityMessageAttachments = pgTable(
  'community_message_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => communityMessages.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    url: text('url').notNull(),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    metadata: jsonb('metadata').default('{}'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: fetch attachments for a message
    index('idx_community_msg_attachments_message_id').on(t.messageId),
  ],
);

// ============================================================
// COMMUNITY REACTIONS
// Normal form: 2NF
// OLTP table
// ============================================================

export const communityReactions = pgTable(
  'community_reactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => communityMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one reaction per user per emoji per message
    uniqueIndex('idx_community_reactions_unique').on(t.messageId, t.userId, t.emoji),
    // Index: fetch reactions for a message
    index('idx_community_reactions_message_id').on(t.messageId),
  ],
);

// ============================================================
// CHANNEL MEMBERS (membership + unread tracking)
// Normal form: 2NF
// OLTP table
// ============================================================

export const channelMembers = pgTable(
  'channel_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => communityChannels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id'),
    isMuted: boolean('is_muted').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one membership per user per channel
    uniqueIndex('idx_channel_members_unique').on(t.channelId, t.userId),
    // Index: list channels for a user
    index('idx_channel_members_user_id').on(t.userId),
  ],
);

// ============================================================
// DIRECT CONVERSATIONS
// Normal form: 2NF
// OLTP table
// ============================================================

export const directConversations = pgTable('direct_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// DIRECT CONVERSATION MEMBERS
// Normal form: 2NF
// OLTP table
// ============================================================

export const directConversationMembers = pgTable(
  'direct_conversation_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => directConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one membership per user per conversation
    uniqueIndex('idx_direct_conv_members_unique').on(t.conversationId, t.userId),
    // Index: list conversations for a user
    index('idx_direct_conv_members_user_id').on(t.userId),
  ],
);

// ============================================================
// DIRECT MESSAGES
// Normal form: 2NF
// OLTP table
// ============================================================

export const directMessages = pgTable(
  'direct_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => directConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    isEdited: boolean('is_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list messages in a conversation
    index('idx_direct_messages_conversation_id').on(t.conversationId),
    // Index: paginated history by conversation + time
    index('idx_direct_messages_conv_created').on(t.conversationId, t.createdAt),
  ],
);

// ============================================================
// DIRECT MESSAGE ATTACHMENTS
// Normal form: 2NF (metadata JSONB is OG data — acceptable per CLAUDE.md)
// OLTP table
// ============================================================

export const directMessageAttachments = pgTable(
  'direct_message_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => directMessages.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    url: text('url').notNull(),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    metadata: jsonb('metadata').default('{}'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: fetch attachments for a message
    index('idx_direct_msg_attachments_message_id').on(t.messageId),
  ],
);

// ============================================================
// BACKLOG ITEMS (community feature roadmap)
// Normal form: 2NF
// OLTP table
// ============================================================

export const backlogItems = pgTable(
  'backlog_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('planned'),
    category: varchar('category', { length: 100 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    estimatedRelease: date('estimated_release', { mode: 'string' }),
    isArchived: boolean('is_archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: filter by status
    index('idx_backlog_items_status').on(t.status),
    // Index: sort order
    index('idx_backlog_items_sort_order').on(t.sortOrder),
  ],
);

// ============================================================
// BACKLOG VOTES
// Normal form: 2NF
// OLTP table
// ============================================================

export const backlogVotes = pgTable(
  'backlog_votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => backlogItems.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    voteType: varchar('vote_type', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one vote per user per item
    uniqueIndex('idx_backlog_votes_unique').on(t.itemId, t.userId),
    // Index: count votes per item
    index('idx_backlog_votes_item_id').on(t.itemId),
  ],
);

// ============================================================
// USER BLOCKS (directional blocking for DMs)
// Normal form: 2NF
// OLTP table
// ============================================================

export const userBlocks = pgTable(
  'user_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one block per pair
    uniqueIndex('idx_user_blocks_unique').on(t.blockerId, t.blockedId),
    // Index: list blocks by blocker
    index('idx_user_blocks_blocker_id').on(t.blockerId),
    // Index: check if blocked
    index('idx_user_blocks_blocked_id').on(t.blockedId),
  ],
);

// ============================================================
// OLTP: OPENROUTER MODEL CATALOG
// Normal form: 2NF — every non-key column depends only on PK
// Synced from OpenRouter /api/v1/models endpoint
// ============================================================

export const openrouterModelCatalog = pgTable(
  'openrouter_model_catalog',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelId: varchar('model_id', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    description: text('description'),
    contextLength: integer('context_length').notNull().default(4096),
    maxOutputTokens: integer('max_output_tokens'),
    inputCostPerM: real('input_cost_per_m').notNull().default(0),
    outputCostPerM: real('output_cost_per_m').notNull().default(0),
    supportsVision: boolean('supports_vision').notNull().default(false),
    supportsStreaming: boolean('supports_streaming').notNull().default(true),
    supportsImageGen: boolean('supports_image_gen').notNull().default(false),
    providerSlug: varchar('provider_slug', { length: 100 }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: fetch only enabled models for model selector dropdown
    index('idx_catalog_is_enabled').on(t.isEnabled),
    // Index: filter catalog by provider
    index('idx_catalog_provider_slug').on(t.providerSlug),
  ],
);

// ============================================================
// PAGES (CMS-lite for legal/static pages)
// Normal form: 2NF
// OLTP table
// ============================================================

export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull().default(''),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// PROJECTS (multi-project workspace for data modelling engagements)
// Normal form: 2NF
// OLTP table
// ============================================================

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    clientName: varchar('client_name', { length: 255 }),
    clientContacts: jsonb('client_contacts').notNull().default('[]'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    // Plain UUID — FK constraint to organisations added once that table is stable
    organisationId: uuid('organisation_id'),
    // FK → clients.id; nullable, set null on client delete
    clientId: uuid('client_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_projects_user_id').on(t.userId),
    // Index: list projects for an organisation
    index('idx_projects_organisation_id').on(t.organisationId),
    // Index: list projects for a client
    index('idx_projects_client_id').on(t.clientId),
  ],
);

// ============================================================
// KANBAN COLUMNS (per-project board columns)
// Normal form: 2NF
// OLTP table
// ============================================================

export const kanbanColumns = pgTable(
  'kanban_columns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    color: varchar('color', { length: 50 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_kanban_columns_project_id').on(t.projectId)],
);

// ============================================================
// KANBAN CARDS (tasks within kanban columns)
// Normal form: 2NF
// OLTP table
// ============================================================

export const kanbanCards = pgTable(
  'kanban_cards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    columnId: uuid('column_id')
      .notNull()
      .references(() => kanbanColumns.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    dueDate: date('due_date'),
    tags: jsonb('tags').notNull().default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
    flowId: uuid('flow_id').references(() => flows.id, { onDelete: 'set null' }),
    contentItemId: uuid('content_item_id').references(() => contentItems.id, {
      onDelete: 'set null',
    }),
    // Assignee — nullable; set null on user delete
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    // Optional cover image (Cloudinary URL)
    coverImageUrl: text('cover_image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_kanban_cards_column_id').on(t.columnId),
    index('idx_kanban_cards_project_id').on(t.projectId),
    // Index: filter/list cards by assignee
    index('idx_kanban_cards_assignee_id').on(t.assigneeId),
  ],
);

// ============================================================
// KANBAN CARD COMMENTS (collaboration on cards)
// Normal form: 2NF
// OLTP table
// ============================================================

export const kanbanCardComments = pgTable(
  'kanban_card_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => kanbanCards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    isEdited: boolean('is_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_kanban_card_comments_card_id').on(t.cardId)],
);

// ============================================================
// KANBAN CARD ATTACHMENTS (files, images, links on cards)
// Normal form: 2NF (metadata JSONB is OG data — acceptable)
// OLTP table
// ============================================================

export const kanbanCardAttachments = pgTable(
  'kanban_card_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => kanbanCards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    url: text('url').notNull(),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_kanban_card_attachments_card_id').on(t.cardId)],
);

// ============================================================
// ORGANISATIONS (multi-tenant workspace grouping)
// Normal form: 2NF — every non-key column depends only on PK
// OLTP table
// ============================================================

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    logoUrl: text('logo_url'),
    joinKey: varchar('join_key', { length: 20 }).notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list organisations owned by a user
    index('idx_organisations_owner_id').on(t.ownerId),
    // Index: slug lookup for vanity URLs
    index('idx_organisations_slug').on(t.slug),
    // Index: join-key lookup for invite flow
    index('idx_organisations_join_key').on(t.joinKey),
  ],
);

// ============================================================
// ORGANISATION MEMBERS (junction: user ↔ organisation with role)
// Normal form: 2NF
// OLTP table
// ============================================================

export const organisationMembers = pgTable(
  'organisation_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // role: owner | admin | member
    role: varchar('role', { length: 20 }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one membership record per user per organisation
    uniqueIndex('idx_org_members_unique').on(t.organisationId, t.userId),
    // Index: list members for an organisation
    index('idx_org_members_org_id').on(t.organisationId),
    // Index: list organisations for a user
    index('idx_org_members_user_id').on(t.userId),
  ],
);

// ============================================================
// PROJECT MEMBERS (collaborators on a project)
// Normal form: 2NF — every non-key column depends only on PK
// OLTP table
// ============================================================

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // owner | editor | viewer
    role: varchar('role', { length: 20 }).notNull().default('member'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one membership per user per project
    uniqueIndex('idx_project_members_project_user').on(t.projectId, t.userId),
    // Index: list members for a project
    index('idx_project_members_project_id').on(t.projectId),
    // Index: list projects a user belongs to
    index('idx_project_members_user_id').on(t.userId),
  ],
);

// ============================================================
// CARD LABELS (per-project label palette)
// Normal form: 2NF — every non-key column depends only on PK
// OLTP table
// ============================================================

export const cardLabels = pgTable(
  'card_labels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 20 }).notNull(),
  },
  (t) => [
    // Unique: label names scoped to a project
    uniqueIndex('idx_card_labels_project_name').on(t.projectId, t.name),
    // Index: list labels for a project
    index('idx_card_labels_project_id').on(t.projectId),
  ],
);

// ============================================================
// CARD LABEL ASSIGNMENTS (junction: kanban_cards ↔ card_labels)
// Normal form: 2NF — composite unique key
// OLTP table
// ============================================================

export const cardLabelAssignments = pgTable(
  'card_label_assignments',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => kanbanCards.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => cardLabels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    // Composite PK as unique constraint
    uniqueIndex('idx_card_label_assignments_pk').on(t.cardId, t.labelId),
    // Index: list labels assigned to a card
    index('idx_card_label_assignments_card_id').on(t.cardId),
    // Index: find all cards with a given label
    index('idx_card_label_assignments_label_id').on(t.labelId),
  ],
);

// ============================================================
// PROJECT ACTIVITIES (immutable audit log of project events)
// Normal form: 2NF (metadata JSONB is audit — acceptable per CLAUDE.md)
// OLTP table
// ============================================================

export const projectActivities = pgTable(
  'project_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // e.g. 'card.created', 'card.moved', 'comment.added', 'attachment.added'
    action: varchar('action', { length: 50 }).notNull(),
    // e.g. 'card', 'column', 'comment', 'attachment', 'project'
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: uuid('entity_id'),
    // audit/contextual snapshot — JSONB acceptable per CLAUDE.md
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: paginated activity feed for a project
    index('idx_project_activities_project_id').on(t.projectId),
    // Index: time-range queries
    index('idx_project_activities_created_at').on(t.createdAt),
    // Index: lookup by actor
    index('idx_project_activities_user_id').on(t.userId),
    // Composite: efficient descending feed query (project_id + created_at)
    index('idx_project_activities_project_created').on(t.projectId, t.createdAt),
  ],
);

// ============================================================
// CLIENTS (enterprise client registry per organisation)
// Normal form: 2NF — every non-key column depends only on PK
// OLTP table
// ============================================================

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    industry: varchar('industry', { length: 100 }),
    website: text('website'),
    logoUrl: text('logo_url'),
    // 'startup' | 'small' | 'medium' | 'large' | 'enterprise'
    companySize: varchar('company_size', { length: 50 }),
    abnTaxId: varchar('abn_tax_id', { length: 50 }),
    addressLine1: varchar('address_line1', { length: 255 }),
    addressLine2: varchar('address_line2', { length: 255 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 100 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list clients for an organisation
    index('idx_clients_org_id').on(t.organisationId),
    // Index: search clients by name
    index('idx_clients_name').on(t.name),
  ],
);

// ============================================================
// CLIENT CONTACTS (people at a client company)
// Normal form: 2NF
// OLTP table
// ============================================================

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    // e.g. 'CTO', 'Data Lead', 'Project Sponsor'
    role: varchar('role', { length: 100 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list contacts for a client
    index('idx_client_contacts_client_id').on(t.clientId),
  ],
);

// ============================================================
// CLIENT CONTRACTS (engagement contracts per client)
// Normal form: 2NF
// OLTP table
// ============================================================

export const clientContracts = pgTable(
  'client_contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // e.g. 'Data Warehouse Build Phase 1'
    name: varchar('name', { length: 255 }).notNull(),
    // 'fixed-price' | 'time-materials' | 'retainer' | 'sow'
    contractType: varchar('contract_type', { length: 50 }),
    // 'draft' | 'active' | 'completed' | 'cancelled'
    status: varchar('status', { length: 30 }).notNull().default('draft'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    billingRate: numeric('billing_rate', { precision: 10, scale: 2 }),
    billingCurrency: varchar('billing_currency', { length: 3 }).notNull().default('AUD'),
    slaTerms: text('sla_terms'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list contracts for a client
    index('idx_client_contracts_client_id').on(t.clientId),
  ],
);

// ============================================================
// PROJECT CHAT MESSAGES
// Normal form: 2NF
// OLTP table
// ============================================================

export const projectMessages = pgTable(
  'project_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    parentId: uuid('parent_id'),
    isEdited: boolean('is_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list messages by project
    index('idx_project_messages_project_id').on(t.projectId),
    // Index: paginated message history by project + time
    index('idx_project_messages_project_created').on(t.projectId, t.createdAt),
    // Index: thread replies
    index('idx_project_messages_parent_id').on(t.parentId),
    // Index: messages by user
    index('idx_project_messages_user_id').on(t.userId),
  ],
);

// ============================================================
// PROJECT CHAT MESSAGE ATTACHMENTS
// Normal form: 2NF
// OLTP table
// ============================================================

export const projectMessageAttachments = pgTable(
  'project_message_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => projectMessages.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    url: text('url').notNull(),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: fetch attachments for a message
    index('idx_project_msg_attachments_message_id').on(t.messageId),
  ],
);

// ============================================================
// PROJECT CHAT REACTIONS
// Normal form: 2NF
// OLTP table
// ============================================================

export const projectMessageReactions = pgTable(
  'project_message_reactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => projectMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one reaction per user per emoji per message
    uniqueIndex('idx_project_msg_reactions_unique').on(t.messageId, t.userId, t.emoji),
    // Index: fetch reactions for a message
    index('idx_project_msg_reactions_message_id').on(t.messageId),
  ],
);

// ============================================================
// PROJECT CHAT READ STATUS
// Normal form: 2NF
// OLTP table
// ============================================================

export const projectReadStatus = pgTable(
  'project_read_status',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageId: uuid('last_message_id'),
  },
  (t) => [
    // Primary key: one read status per user per project
    uniqueIndex('idx_project_read_status_pk').on(t.projectId, t.userId),
    // Index: user's read status across projects
    index('idx_project_read_status_user_id').on(t.userId),
  ],
);

// ============================================================
// ==== MODEL STUDIO ==========================================
// Greenfield feature: data-modelling studio with ERD canvas,
// three layers (conceptual/logical/physical), two notations
// (IE/IDEF1X), DDL export, RAG chat, plugin-ready metadata.
//
// Feature is gated by the `enable_model_studio` row in the
// `settings` key/value table. When OFF, all Model Studio routes
// return 404 to hide existence.
//
// All tables prefixed `data_model_*` to avoid collision with
// `dim_models` (LLM pricing dimension table).
//
// Every table: 2NF, UUID PK, timestamps with tz, cascade FKs,
// `metadata jsonb` + `tags jsonb` plug-in envelope per CEO-review
// architecture. Every FK has an index with a comment above it.
// ============================================================

// ============================================================
// DATA MODELS (Model Studio project root)
// Normal form: 2NF. OLTP.
// Scoped to a project (project_id) AND owned by a user (owner_id).
// Organisation is derived via projects.organisation_id — we do not
// denormalize it here to avoid drift.
// Authorization: user can read if (owner_id = user) OR active member
// of the project's organisation in organisation_members.
// ============================================================

export const dataModels = pgTable(
  'data_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    // Active layer the user was last on: conceptual | logical | physical
    activeLayer: varchar('active_layer', { length: 20 }).notNull().default('conceptual'),
    // Notation preference: ie | idef1x (render-only, not data)
    notation: varchar('notation', { length: 20 }).notNull().default('ie'),
    // Plug-in envelope for future governance/classification without schema change.
    metadata: jsonb('metadata').notNull().default('{}'),
    tags: jsonb('tags').notNull().default('[]'),
    // Soft milestone: when DDL was last exported (null = never).
    lastExportedAt: timestamp('last_exported_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one model name per (project, owner) pair — two projects
    // can each own a "Customer Domain" model without conflict.
    uniqueIndex('idx_data_models_unique_name').on(t.projectId, t.ownerId, t.name),
    // Index: list models for a project (sidebar + detail page)
    index('idx_data_models_project_id').on(t.projectId),
    // Index: list models owned by a user (profile / global view)
    index('idx_data_models_owner_id').on(t.ownerId),
  ],
);

// ============================================================
// DATA MODEL ENTITIES (tables / business objects across all layers)
// Normal form: 2NF. OLTP.
// entity_type: standard | associative | subtype | supertype
// layer: conceptual | logical | physical
// ============================================================

export const dataModelEntities = pgTable(
  'data_model_entities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    businessName: varchar('business_name', { length: 255 }),
    description: text('description'),
    layer: varchar('layer', { length: 20 }).notNull(),
    entityType: varchar('entity_type', { length: 20 }).notNull().default('standard'),
    metadata: jsonb('metadata').notNull().default('{}'),
    tags: jsonb('tags').notNull().default('[]'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: load all entities for a model (core read path)
    index('idx_data_model_entities_data_model_id').on(t.dataModelId),
    // Index: filter entities by layer when switching layers on canvas
    index('idx_data_model_entities_model_layer').on(t.dataModelId, t.layer),
  ],
);

// ============================================================
// DATA MODEL LAYER LINKS (entity projections across layers)
// Normal form: 2NF. OLTP.
// Parent (conceptual) → child (logical), or logical → physical.
// Parent and child MUST be on different layers (enforced in service).
// ============================================================

export const dataModelLayerLinks = pgTable(
  'data_model_layer_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => dataModelEntities.id, { onDelete: 'cascade' }),
    childId: uuid('child_id')
      .notNull()
      .references(() => dataModelEntities.id, { onDelete: 'cascade' }),
    linkType: varchar('link_type', { length: 40 }).notNull().default('layer_projection'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: no duplicate parent↔child link
    uniqueIndex('idx_data_model_layer_links_unique').on(t.parentId, t.childId),
    // Index: find children of a parent (walk down layers)
    index('idx_data_model_layer_links_parent_id').on(t.parentId),
    // Index: find parents of a child (walk up layers)
    index('idx_data_model_layer_links_child_id').on(t.childId),
  ],
);

// ============================================================
// DATA MODEL ATTRIBUTES (columns / fields on an entity)
// Normal form: 2NF. OLTP.
// ordinal_position orders attributes within an entity.
// ============================================================

export const dataModelAttributes = pgTable(
  'data_model_attributes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => dataModelEntities.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    businessName: varchar('business_name', { length: 255 }),
    description: text('description'),
    dataType: varchar('data_type', { length: 64 }),
    length: integer('length'),
    precision: integer('precision'),
    scale: integer('scale'),
    isNullable: boolean('is_nullable').notNull().default(true),
    isPrimaryKey: boolean('is_primary_key').notNull().default(false),
    isForeignKey: boolean('is_foreign_key').notNull().default(false),
    isUnique: boolean('is_unique').notNull().default(false),
    defaultValue: text('default_value'),
    ordinalPosition: integer('ordinal_position').notNull().default(0),
    metadata: jsonb('metadata').notNull().default('{}'),
    tags: jsonb('tags').notNull().default('[]'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: attribute name unique within an entity
    uniqueIndex('idx_data_model_attributes_unique_name').on(t.entityId, t.name),
    // Index: load all attributes for an entity (core read path)
    index('idx_data_model_attributes_entity_id').on(t.entityId),
  ],
);

// ============================================================
// DATA MODEL ATTRIBUTE LINKS (logical attr ↔ physical column)
// Normal form: 2NF. OLTP.
// Mirrors layer_links but at attribute granularity.
// ============================================================

export const dataModelAttributeLinks = pgTable(
  'data_model_attribute_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => dataModelAttributes.id, { onDelete: 'cascade' }),
    childId: uuid('child_id')
      .notNull()
      .references(() => dataModelAttributes.id, { onDelete: 'cascade' }),
    linkType: varchar('link_type', { length: 40 }).notNull().default('layer_projection'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: no duplicate attribute link
    uniqueIndex('idx_data_model_attribute_links_unique').on(t.parentId, t.childId),
    // Index: walk down from a parent attribute
    index('idx_data_model_attribute_links_parent_id').on(t.parentId),
    // Index: walk up from a child attribute
    index('idx_data_model_attribute_links_child_id').on(t.childId),
  ],
);

// ============================================================
// DATA MODEL RELATIONSHIPS (ERD edges between entities)
// Normal form: 2NF. OLTP.
// Source and target must be on the same layer (enforced in service).
// Cardinality enum: one | many | zero_or_one | zero_or_many | one_or_many
// ============================================================

export const dataModelRelationships = pgTable(
  'data_model_relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    sourceEntityId: uuid('source_entity_id')
      .notNull()
      .references(() => dataModelEntities.id, { onDelete: 'cascade' }),
    targetEntityId: uuid('target_entity_id')
      .notNull()
      .references(() => dataModelEntities.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }),
    sourceCardinality: varchar('source_cardinality', { length: 20 }).notNull(),
    targetCardinality: varchar('target_cardinality', { length: 20 }).notNull(),
    isIdentifying: boolean('is_identifying').notNull().default(false),
    layer: varchar('layer', { length: 20 }).notNull(),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: load all relationships for a model
    index('idx_data_model_rels_data_model_id').on(t.dataModelId),
    // Index: find relationships where an entity is the source
    index('idx_data_model_rels_source_entity').on(t.sourceEntityId),
    // Index: find relationships where an entity is the target
    index('idx_data_model_rels_target_entity').on(t.targetEntityId),
  ],
);

// ============================================================
// DATA MODEL CANVAS STATES (per-user, per-layer viewport + positions)
// Normal form: 2NF. OLTP.
// Separate from model data so multiple views of the same model can
// coexist (phase 2: subject-area subviews).
// ============================================================

export const dataModelCanvasStates = pgTable(
  'data_model_canvas_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    layer: varchar('layer', { length: 20 }).notNull(),
    // { [nodeId]: { x: number, y: number } } — JSONB node positions
    nodePositions: jsonb('node_positions').notNull().default('{}'),
    // { x: number, y: number, zoom: number } — JSONB viewport
    viewport: jsonb('viewport').notNull().default('{"x":0,"y":0,"zoom":1}'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: one canvas state per user per model per layer (optimistic concurrency)
    uniqueIndex('idx_data_model_canvas_unique').on(t.dataModelId, t.userId, t.layer),
    // Index: load a user's canvas states across all layers for a model
    index('idx_data_model_canvas_model_user').on(t.dataModelId, t.userId),
  ],
);

// ============================================================
// DATA MODEL SEMANTIC MAPPINGS (physical col → logical attr → conceptual term)
// Normal form: 2NF. OLTP.
// Exportable as the semantic-layer contract.
// ============================================================

export const dataModelSemanticMappings = pgTable(
  'data_model_semantic_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    physicalAttributeId: uuid('physical_attribute_id')
      .notNull()
      .references(() => dataModelAttributes.id, { onDelete: 'cascade' }),
    logicalAttributeId: uuid('logical_attribute_id').references(() => dataModelAttributes.id, {
      onDelete: 'set null',
    }),
    conceptualTerm: varchar('conceptual_term', { length: 255 }),
    semanticLabel: varchar('semantic_label', { length: 255 }),
    biToolName: varchar('bi_tool_name', { length: 100 }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: list all mappings for a model
    index('idx_data_model_semantic_data_model_id').on(t.dataModelId),
    // Index: find mapping by physical attribute (reverse lookup)
    index('idx_data_model_semantic_physical_attr').on(t.physicalAttributeId),
    // Index: find mapping by logical attribute
    index('idx_data_model_semantic_logical_attr').on(t.logicalAttributeId),
  ],
);

// ============================================================
// DATA MODEL CHAT LOGS (every AI chat turn over a model)
// Normal form: 2NF. OLTP (analytics fed later via fact_* tables).
// Captures full context for future fine-tuning corpus.
// ============================================================

export const dataModelChatLogs = pgTable(
  'data_model_chat_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userMessage: text('user_message').notNull(),
    assistantMessage: text('assistant_message').notNull(),
    // Compact serialisation of the model at turn time (for replay / fine-tuning)
    modelContext: jsonb('model_context').notNull().default('{}'),
    // RAG: which embedding rows were retrieved for this turn
    retrievedChunks: jsonb('retrieved_chunks').notNull().default('[]'),
    tokensUsed: integer('tokens_used').notNull().default(0),
    // Which provider/model answered (for later ablation)
    modelSlug: varchar('model_slug', { length: 150 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: load chat history for a model, newest first
    index('idx_data_model_chat_logs_model_time').on(t.dataModelId, t.createdAt),
    // Index: user's chat history across models
    index('idx_data_model_chat_logs_user_id').on(t.userId),
  ],
);

// ============================================================
// DATA MODEL EMBEDDINGS (pgvector — RAG content chunks)
// Normal form: 2NF. OLTP.
// embedding column uses voyage-3 (1024 dims).
// ivfflat index is created at bootstrap (not expressible via drizzle).
// ============================================================

export const dataModelEmbeddings = pgTable(
  'data_model_embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    // Polymorphic pointer — object_type tells you which entity/attr/rel this embeds
    objectId: uuid('object_id').notNull(),
    objectType: varchar('object_type', { length: 40 }).notNull(),
    // Short digest of the content that produced this embedding — used to
    // detect staleness and to dedupe rapid-edit re-embed jobs.
    contentDigest: varchar('content_digest', { length: 64 }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique: only one current embedding per object (per digest)
    uniqueIndex('idx_data_model_embeddings_unique_obj').on(t.objectId, t.contentDigest),
    // Index: restrict RAG search to one model (security + performance)
    index('idx_data_model_embeddings_data_model_id').on(t.dataModelId),
    // Index: polymorphic lookup
    index('idx_data_model_embeddings_object').on(t.objectId),
    // NOTE: ivfflat(embedding vector_cosine_ops, lists = 100) is created
    // at startup by ensureModelStudioIndexes() — drizzle cannot express it.
  ],
);

// ============================================================
// DATA MODEL EMBEDDING JOBS (debounced re-embed queue)
// Normal form: 2NF. OLTP.
// Rapid edits coalesce on (object_id, content_digest). Worker drains
// every 3s, dedupes by latest digest per object, calls voyage-3 once.
// status: pending | processing | failed | done
// ============================================================

export const dataModelEmbeddingJobs = pgTable(
  'data_model_embedding_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    objectType: varchar('object_type', { length: 40 }).notNull(),
    contentDigest: varchar('content_digest', { length: 64 }).notNull(),
    content: text('content').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    // Index: worker drains pending jobs oldest-first
    index('idx_data_model_embedding_jobs_status_time').on(t.status, t.createdAt),
    // Index: dedupe lookup when enqueueing a new mutation
    index('idx_data_model_embedding_jobs_object').on(t.objectId),
  ],
);

// ============================================================
// DATA MODEL CHANGE LOG (event-bus placeholder + audit trail)
// Normal form: 2NF. OLTP.
// Every CRUD on a Model Studio object writes one row here.
// Seeds the future event-bus (phase 2) without a schema change.
// action: create | update | delete
// ============================================================

export const dataModelChangeLog = pgTable(
  'data_model_change_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dataModelId: uuid('data_model_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    objectType: varchar('object_type', { length: 40 }).notNull(),
    action: varchar('action', { length: 20 }).notNull(),
    changedBy: uuid('changed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: timeline of changes for a model
    index('idx_data_model_change_log_model_time').on(t.dataModelId, t.createdAt),
    // Index: all changes to a specific object
    index('idx_data_model_change_log_object').on(t.objectId),
    // Index: a user's activity across models
    index('idx_data_model_change_log_user').on(t.changedBy),
  ],
);

// ==== END MODEL STUDIO =======================================
