/**
 * Step 6 Showcase seed.
 *
 * Creates a single data model under the e2e-test user / project that
 * exercises EVERY Step 6 feature a QA tester needs to sanity check:
 *
 *   - 6 logical-layer entities with realistic PK / NN / UQ / FK flags
 *   - 5 relationships covering every cardinality + identifying and
 *     self-ref arc
 *   - Identifying relationship (`order` 1:many `order_line`) fires the
 *     real PK propagation so QA can confirm composite-PK surfacing
 *   - Canvas positions laid out on a 1000x600 grid so no entity
 *     stacks at (0, 0)
 *
 * Layout:
 *
 *     customer        order          order_line       product
 *     (80, 80)       (380, 80)       (680, 80)       (980, 80)
 *
 *     employee                       address
 *     (80, 380)                      (680, 380)
 *
 * Prereq:
 *   `pnpm -C packages/server db:seed-e2e` must have run first so the
 *   `e2e-test@test.com` user + `E2E Test Project` exist.
 *
 * Usage:
 *   pnpm -C packages/server db:seed-step6-showcase
 *
 * Idempotency:
 *   Wrapped in `runOnce('seed-step6-showcase', ...)` — re-runs are
 *   no-ops. To re-seed after schema changes, delete the
 *   `applied_migrations` row named `seed-step6-showcase` AND the
 *   existing `Step 6 Showcase` model before re-running.
 *
 * Spec:
 *   See `tasks/alignment-step6-patch.md` §1 row #7 for the entity +
 *   relationship specification this seed realises.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { and, eq } from 'drizzle-orm';
import type { AttributeCreate, CreateRelationshipInput, Layer } from '@cc/shared';
import { db, pool } from '../db/index.js';
import { users, projects } from '../db/schema.js';
import { runOnce } from '../db/migration-runner.js';
import { logger } from '../config/logger.js';
import { createModel } from '../services/model-studio-model.service.js';
import { createEntity } from '../services/model-studio-entity.service.js';
import { createAttribute } from '../services/model-studio-attribute.service.js';
import { createRelationship } from '../services/model-studio-relationship.service.js';
import { upsertCanvasState } from '../services/model-studio-canvas.service.js';

const E2E_USER_EMAIL = 'e2e-test@test.com';
const E2E_PROJECT_NAME = 'E2E Test Project';
const SHOWCASE_MODEL_NAME = 'Step 6 Showcase';
const SHOWCASE_MODEL_DESCRIPTION =
  'Exercises every Step 6 feature — draw rels, toggle identifying, flip notation, self-ref, cascade delete. See tasks/alignment-step6-patch.md.';
const SHOWCASE_LAYER: Layer = 'logical';
const RUN_ONCE_NAME = 'seed-step6-showcase';

interface SeededEntity {
  id: string;
  slug: string;
}

/**
 * Per-entity canvas positions. Each slug maps to an (x, y) slot on the
 * 1000x600 grid described in the file header. The canvas-state row
 * uses entity UUIDs as keys so we remap after creation.
 */
const POSITIONS: Record<string, { x: number; y: number }> = {
  customer: { x: 80, y: 80 },
  order: { x: 380, y: 80 },
  order_line: { x: 680, y: 80 },
  product: { x: 980, y: 80 },
  employee: { x: 80, y: 380 },
  address: { x: 680, y: 380 },
};

async function resolveUserId(): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, E2E_USER_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(
      `[seed-step6-showcase] User ${E2E_USER_EMAIL} not found. Run \`pnpm -C packages/server db:seed-e2e\` first.`,
    );
  }
  return row.id;
}

async function resolveProjectId(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.name, E2E_PROJECT_NAME)))
    .limit(1);
  if (!row) {
    throw new Error(
      `[seed-step6-showcase] Project "${E2E_PROJECT_NAME}" not found for ${E2E_USER_EMAIL}. Run \`pnpm -C packages/server db:seed-e2e\` first.`,
    );
  }
  return row.id;
}

async function seedEntity(
  userId: string,
  modelId: string,
  slug: string,
  businessName: string,
  description: string,
): Promise<SeededEntity> {
  const entity = await createEntity(userId, modelId, {
    name: slug,
    businessName,
    description,
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });
  logger.info(
    { scope: 'seed-step6-showcase', slug, entityId: entity.id },
    'Showcase entity created',
  );
  return { id: entity.id, slug };
}

async function seedAttribute(
  userId: string,
  modelId: string,
  entityId: string,
  dto: AttributeCreate,
): Promise<void> {
  await createAttribute(userId, modelId, entityId, dto);
  logger.info(
    { scope: 'seed-step6-showcase', entityId, attribute: dto.name, pk: dto.isPrimaryKey === true },
    'Showcase attribute created',
  );
}

async function seedRelationship(
  userId: string,
  modelId: string,
  label: string,
  input: CreateRelationshipInput,
): Promise<string> {
  const rel = await createRelationship(userId, modelId, input);
  logger.info(
    {
      scope: 'seed-step6-showcase',
      label,
      relId: rel.id,
      identifying: input.isIdentifying,
    },
    'Showcase relationship created',
  );
  return rel.id;
}

async function seedShowcase(): Promise<void> {
  logger.info({ scope: 'seed-step6-showcase' }, 'Starting Step 6 Showcase seed');

  const userId = await resolveUserId();
  const projectId = await resolveProjectId(userId);

  // 1. Model
  const model = await createModel(userId, {
    projectId,
    name: SHOWCASE_MODEL_NAME,
    description: SHOWCASE_MODEL_DESCRIPTION,
    activeLayer: SHOWCASE_LAYER,
    notation: 'ie',
    originDirection: 'greenfield',
  });
  const modelId = model.id;
  logger.info(
    { scope: 'seed-step6-showcase', modelId, userId, projectId },
    'Showcase model created',
  );

  // 2. Entities — createEntity order is alphabetical by slug for
  // determinism; relationships below use named refs.
  const customer = await seedEntity(
    userId,
    modelId,
    'customer',
    'Customer',
    'Person or org that places orders.',
  );
  const order = await seedEntity(userId, modelId, 'order', 'Order', 'Customer purchase header.');
  const orderLine = await seedEntity(
    userId,
    modelId,
    'order_line',
    'Order Line',
    'Line item on an order — identifying child of order.',
  );
  const product = await seedEntity(userId, modelId, 'product', 'Product', 'Purchasable SKU.');
  const employee = await seedEntity(
    userId,
    modelId,
    'employee',
    'Employee',
    'Staff member — self-references via manager_id.',
  );
  const address = await seedEntity(
    userId,
    modelId,
    'address',
    'Address',
    'Postal address — optional 1:1 to customer.',
  );

  // 3. Attributes. PK + FK flags match the spec in
  // tasks/alignment-step6-patch.md §1 row #7.

  // customer
  await seedAttribute(userId, modelId, customer.id, {
    name: 'customer_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await seedAttribute(userId, modelId, customer.id, {
    name: 'email',
    dataType: 'varchar',
    length: 255,
    isNullable: false,
    isUnique: true,
  });
  await seedAttribute(userId, modelId, customer.id, {
    name: 'display_name',
    dataType: 'varchar',
    length: 255,
    isNullable: false,
  });

  // order
  await seedAttribute(userId, modelId, order.id, {
    name: 'order_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await seedAttribute(userId, modelId, order.id, {
    name: 'customer_id',
    dataType: 'uuid',
    isNullable: false,
    isForeignKey: true,
  });
  await seedAttribute(userId, modelId, order.id, {
    name: 'placed_at',
    dataType: 'timestamp',
    isNullable: false,
  });

  // order_line — composite PK (order_id + line_number). The order_id
  // column is propagated automatically by the identifying rel below,
  // but the natural PK half (line_number) is seeded here. quantity is
  // a plain measure column. product_id is a FK to product.
  await seedAttribute(userId, modelId, orderLine.id, {
    name: 'line_number',
    dataType: 'int',
    isPrimaryKey: true,
    isNullable: false,
  });
  await seedAttribute(userId, modelId, orderLine.id, {
    name: 'product_id',
    dataType: 'uuid',
    isNullable: false,
    isForeignKey: true,
  });
  await seedAttribute(userId, modelId, orderLine.id, {
    name: 'quantity',
    dataType: 'int',
    isNullable: false,
  });

  // product
  await seedAttribute(userId, modelId, product.id, {
    name: 'product_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await seedAttribute(userId, modelId, product.id, {
    name: 'sku',
    dataType: 'varchar',
    length: 64,
    isNullable: false,
    isUnique: true,
  });
  await seedAttribute(userId, modelId, product.id, {
    name: 'name',
    dataType: 'varchar',
    length: 255,
    isNullable: false,
  });

  // employee (self-ref)
  await seedAttribute(userId, modelId, employee.id, {
    name: 'employee_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await seedAttribute(userId, modelId, employee.id, {
    name: 'manager_id',
    dataType: 'uuid',
    isNullable: true,
    isForeignKey: true,
  });

  // address
  await seedAttribute(userId, modelId, address.id, {
    name: 'address_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await seedAttribute(userId, modelId, address.id, {
    name: 'street',
    dataType: 'varchar',
    length: 255,
    isNullable: false,
  });

  // 4. Relationships — call through the real service so identifying
  // propagation + audit logging fire exactly as in the UI path.

  // 4.1 customer 1:many order — non-identifying
  await seedRelationship(userId, modelId, 'customer -> order', {
    sourceEntityId: customer.id,
    targetEntityId: order.id,
    name: 'places',
    sourceCardinality: 'one',
    targetCardinality: 'one_or_many',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });

  // 4.2 order 1:many order_line — IDENTIFYING (propagates order_id)
  await seedRelationship(userId, modelId, 'order -> order_line (identifying)', {
    sourceEntityId: order.id,
    targetEntityId: orderLine.id,
    name: 'contains',
    sourceCardinality: 'one',
    targetCardinality: 'one_or_many',
    isIdentifying: true,
    layer: SHOWCASE_LAYER,
  });

  // 4.3 product 1:many order_line — non-identifying, zero_or_many on target
  await seedRelationship(userId, modelId, 'product -> order_line', {
    sourceEntityId: product.id,
    targetEntityId: orderLine.id,
    name: 'appears_on',
    sourceCardinality: 'one',
    targetCardinality: 'zero_or_many',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });

  // 4.4 employee self-ref via manager_id — exercises self-ref arc
  await seedRelationship(userId, modelId, 'employee self-ref', {
    sourceEntityId: employee.id,
    targetEntityId: employee.id,
    name: 'manages',
    sourceCardinality: 'zero_or_one',
    targetCardinality: 'zero_or_many',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });

  // 4.5 customer 0..1:1 address — optional-bar + circle glyph test
  await seedRelationship(userId, modelId, 'customer -> address (optional 1:1)', {
    sourceEntityId: customer.id,
    targetEntityId: address.id,
    name: 'lives_at',
    sourceCardinality: 'zero_or_one',
    targetCardinality: 'one',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });

  // 5. Canvas positions — upsert once at the logical layer so the
  // canvas renders entities spread across the grid on first paint.
  const nodePositions: Record<string, { x: number; y: number }> = {
    [customer.id]: POSITIONS.customer,
    [order.id]: POSITIONS.order,
    [orderLine.id]: POSITIONS.order_line,
    [product.id]: POSITIONS.product,
    [employee.id]: POSITIONS.employee,
    [address.id]: POSITIONS.address,
  };
  await upsertCanvasState(userId, modelId, SHOWCASE_LAYER, {
    nodePositions,
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  logger.info(
    { scope: 'seed-step6-showcase', modelId, nodes: Object.keys(nodePositions).length },
    'Showcase canvas positions upserted',
  );

  logger.info(
    {
      scope: 'seed-step6-showcase',
      modelId,
      entities: 6,
      relationships: 5,
    },
    'Step 6 Showcase seed complete',
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    logger.error({ scope: 'seed-step6-showcase' }, 'DATABASE_URL not set');
    process.exit(1);
  }

  const result = await runOnce(RUN_ONCE_NAME, seedShowcase);
  if (result.ran) {
    logger.info({ scope: 'seed-step6-showcase' }, 'Showcase seed applied ✓');
  } else {
    logger.info(
      { scope: 'seed-step6-showcase' },
      'Showcase seed skipped: already applied (runOnce marker held)',
    );
  }

  await pool.end();
}

main().catch(async (err) => {
  logger.error({ err, scope: 'seed-step6-showcase' }, 'Showcase seed FAILED');
  await pool.end().catch(() => {});
  process.exit(1);
});
