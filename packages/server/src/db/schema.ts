import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb, integer, index } from 'drizzle-orm/pg-core';

// ============================================================
// USERS
// Normal form: 2NF (role as varchar — will migrate to role_id FK in Batch 2)
// ============================================================

// Forward declaration for circular FK reference
// roles table is defined below — roleId FK added after roles table exists

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  // DEPRECATED: role varchar — kept during migration, will be removed
  role: varchar('role', { length: 50 }).notNull().default('Subscriber'),
  // NEW: proper FK to roles table
  roleId: uuid('role_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_users_role_id').on(t.roleId),
]);

// ============================================================
// REFRESH TOKENS
// Normal form: 2NF
// ============================================================

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  // Index: lookup tokens by user for cleanup
  index('idx_refresh_tokens_user_id').on(t.userId),
]);

// ============================================================
// FLOWS (orchestrations)
// Normal form: 2NF (config JSONB deprecated — use flow_fields + flow_steps)
// ============================================================

export const flows = pgTable('flows', {
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
}, (t) => [
  index('idx_flows_user_id').on(t.userId),
]);

// ============================================================
// FLOW FIELDS (normalized from flows.config.fields)
// Normal form: 2NF
// ============================================================

export const flowFields = pgTable('flow_fields', {
  id: uuid('id').defaultRandom().primaryKey(),
  flowId: uuid('flow_id').notNull().references(() => flows.id, { onDelete: 'cascade' }),
  fieldId: varchar('field_id', { length: 100 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  placeholder: varchar('placeholder', { length: 255 }),
  isRequired: boolean('is_required').notNull().default(false),
  options: jsonb('options').default('[]'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list fields for a flow
  index('idx_flow_fields_flow_id').on(t.flowId),
]);

// ============================================================
// FLOW STEPS (normalized from flows.config.steps)
// Normal form: 2NF (inputMappings/overrides/editorConfig JSONB acceptable — opaque config)
// ============================================================

export const flowSteps = pgTable('flow_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  flowId: uuid('flow_id').notNull().references(() => flows.id, { onDelete: 'cascade' }),
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
}, (t) => [
  // Index: list steps for a flow, lookup by skill
  index('idx_flow_steps_flow_id').on(t.flowId),
  index('idx_flow_steps_skill_id').on(t.skillId),
]);

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
// Normal form: 1NF — config JSONB contains relational data (will normalize in Batch 5)
// ============================================================

export const skills = pgTable('skills', {
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
  config: jsonb('config').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list skills by user
  index('idx_skills_user_id').on(t.userId),
]);

// ============================================================
// SKILL VERSIONS
// Normal form: 1NF — config JSONB mirrors skills.config
// ============================================================

export const skillVersions = pgTable('skill_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id')
    .notNull()
    .references(() => skills.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  config: jsonb('config').notNull(),
  changelog: text('changelog'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list versions for a skill
  index('idx_skill_versions_skill_id').on(t.skillId),
]);

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

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: lookup permissions by role, roles by permission
  index('idx_role_permissions_role_id').on(t.roleId),
  index('idx_role_permissions_permission_id').on(t.permissionId),
]);

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

export const contentItems = pgTable('content_items', {
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
  tags: jsonb('tags').notNull().default('[]'),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list content by user, filter by flow, filter by channel
  index('idx_content_items_user_id').on(t.userId),
  index('idx_content_items_flow_id').on(t.flowId),
  index('idx_content_items_channel_id').on(t.channelId),
]);

// ============================================================
// EXECUTION LOGS (per-step telemetry)
// Normal form: 2NF (skill_name varchar — will migrate to skill_id FK in Batch 6)
// ============================================================

export const executionLogs = pgTable('execution_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  flowId: uuid('flow_id').notNull().references(() => flows.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  skillName: varchar('skill_name', { length: 255 }),
  model: varchar('model', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 100 }),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  duration: integer('duration').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull(),
  editorRounds: integer('editor_rounds').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: query logs by flow, by user, by date
  index('idx_execution_logs_flow_id').on(t.flowId),
  index('idx_execution_logs_user_id').on(t.userId),
]);

// ============================================================
// EXECUTION RUNS (per-orchestration run)
// Normal form: 1NF (stepResults JSONB — acceptable: snapshot of run results)
// ============================================================

export const executionRuns = pgTable('execution_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  flowId: uuid('flow_id').notNull().references(() => flows.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inputs: jsonb('inputs').notNull().default('{}'),
  stepResults: jsonb('step_results').notNull().default('[]'),
  status: varchar('status', { length: 20 }).notNull(),
  totalDuration: integer('total_duration').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list runs by flow, by user
  index('idx_execution_runs_flow_id').on(t.flowId),
  index('idx_execution_runs_user_id').on(t.userId),
]);

// ============================================================
// USER PROFILES
// Normal form: 2NF
// ============================================================

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
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
  defaultEditorApprovalMode: varchar('default_editor_approval_mode', { length: 10 }).notNull().default('auto'),
  timezone: varchar('timezone', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// USER RULES (global writing rules injected into AI calls)
// Normal form: 2NF
// ============================================================

export const userRules = pgTable('user_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  rules: text('rules').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  category: varchar('category', { length: 20 }).notNull().default('custom'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list rules by user
  index('idx_user_rules_user_id').on(t.userId),
]);

// ============================================================
// SOCIAL ACCOUNTS (placeholder for OAuth integrations)
// Normal form: 2NF (metadata JSONB is audit — acceptable per CLAUDE.md)
// ============================================================

export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 30 }).notNull(),
  accountName: varchar('account_name', { length: 255 }),
  accountId: varchar('account_id', { length: 255 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  isConnected: boolean('is_connected').notNull().default(false),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list social accounts by user
  index('idx_social_accounts_user_id').on(t.userId),
]);

// ============================================================
// PENDING APPROVALS (DB-backed editor approval polling)
// Normal form: 2NF
// ============================================================

export const pendingApprovals = pgTable('pending_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  flowId: uuid('flow_id').notNull().references(() => flows.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  round: integer('round').notNull(),
  generatorOutput: text('generator_output').notNull(),
  editorFeedback: text('editor_feedback').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  userAction: varchar('user_action', { length: 20 }),
  userFeedback: text('user_feedback'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: poll by flow+user+status
  index('idx_pending_approvals_flow_id').on(t.flowId),
  index('idx_pending_approvals_user_id').on(t.userId),
]);

// ============================================================
// CONVERSATIONS (AI chat)
// Normal form: 2NF
// ============================================================

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull().default('New Chat'),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list conversations by user sorted by date
  index('idx_conversations_user_id').on(t.userId),
]);

// ============================================================
// MESSAGES (chat messages)
// Normal form: 2NF
// ============================================================

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  contentType: varchar('content_type', { length: 20 }).notNull().default('text'),
  model: varchar('model', { length: 100 }),
  tokens: integer('tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Index: list messages by conversation
  index('idx_messages_conversation_id').on(t.conversationId),
]);
