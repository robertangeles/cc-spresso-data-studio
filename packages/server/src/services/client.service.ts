import { eq, and, count } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import type {
  CreateClientDTO,
  UpdateClientDTO,
  CreateClientContactDTO,
  UpdateClientContactDTO,
  CreateClientContractDTO,
  UpdateClientContractDTO,
} from '@cc/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyOrgMembership(orgId: string, userId: string) {
  const [member] = await db
    .select()
    .from(schema.organisationMembers)
    .where(
      and(
        eq(schema.organisationMembers.organisationId, orgId),
        eq(schema.organisationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!member) throw new ForbiddenError('You are not a member of this organisation.');
  return member;
}

async function verifyOrgAdminAccess(orgId: string, userId: string) {
  const member = await verifyOrgMembership(orgId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw new ForbiddenError('Admin or owner access required.');
  }
  return member;
}

/**
 * Verify the calling user is a member of the client's organisation.
 * Returns the client row.
 */
export async function verifyClientAccess(clientId: string, userId: string) {
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) throw new NotFoundError('Client not found.');

  await verifyOrgMembership(client.organisationId, userId);

  return client;
}

async function verifyClientAdminAccess(clientId: string, userId: string) {
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) throw new NotFoundError('Client not found.');

  await verifyOrgAdminAccess(client.organisationId, userId);

  return client;
}

// ---------------------------------------------------------------------------
// Client CRUD
// ---------------------------------------------------------------------------

export async function listClients(orgId: string, userId: string) {
  await verifyOrgMembership(orgId, userId);

  // LEFT JOIN count of projects per client
  const rows = await db
    .select({
      id: schema.clients.id,
      organisationId: schema.clients.organisationId,
      name: schema.clients.name,
      industry: schema.clients.industry,
      website: schema.clients.website,
      logoUrl: schema.clients.logoUrl,
      companySize: schema.clients.companySize,
      abnTaxId: schema.clients.abnTaxId,
      addressLine1: schema.clients.addressLine1,
      addressLine2: schema.clients.addressLine2,
      city: schema.clients.city,
      state: schema.clients.state,
      postalCode: schema.clients.postalCode,
      country: schema.clients.country,
      notes: schema.clients.notes,
      createdAt: schema.clients.createdAt,
      updatedAt: schema.clients.updatedAt,
      projectCount: count(schema.projects.id),
    })
    .from(schema.clients)
    .leftJoin(schema.projects, eq(schema.projects.clientId, schema.clients.id))
    .where(eq(schema.clients.organisationId, orgId))
    .groupBy(schema.clients.id);

  return rows;
}

export async function createClient(orgId: string, userId: string, dto: CreateClientDTO) {
  if (!dto.name || dto.name.trim().length === 0) {
    throw new Error('Client name is required.');
  }

  await verifyOrgMembership(orgId, userId);

  const [client] = await db
    .insert(schema.clients)
    .values({
      organisationId: orgId,
      name: dto.name.trim(),
      industry: dto.industry?.trim() ?? null,
      website: dto.website?.trim() ?? null,
      logoUrl: dto.logoUrl?.trim() ?? null,
      companySize: dto.companySize?.trim() ?? null,
      abnTaxId: dto.abnTaxId?.trim() ?? null,
      addressLine1: dto.addressLine1?.trim() ?? null,
      addressLine2: dto.addressLine2?.trim() ?? null,
      city: dto.city?.trim() ?? null,
      state: dto.state?.trim() ?? null,
      postalCode: dto.postalCode?.trim() ?? null,
      country: dto.country?.trim() ?? null,
      notes: dto.notes?.trim() ?? null,
    })
    .returning();

  return client;
}

export async function getClient(clientId: string, userId: string) {
  const client = await verifyClientAccess(clientId, userId);

  const [contacts, contracts, projectCountRows] = await Promise.all([
    db.select().from(schema.clientContacts).where(eq(schema.clientContacts.clientId, clientId)),
    db.select().from(schema.clientContracts).where(eq(schema.clientContracts.clientId, clientId)),
    db
      .select({ projectCount: count(schema.projects.id) })
      .from(schema.projects)
      .where(eq(schema.projects.clientId, clientId)),
  ]);

  return {
    ...client,
    contacts,
    contracts,
    projectCount: projectCountRows[0]?.projectCount ?? 0,
  };
}

export async function updateClient(clientId: string, userId: string, dto: UpdateClientDTO) {
  await verifyClientAdminAccess(clientId, userId);

  const updates: Partial<typeof schema.clients.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (dto.name !== undefined) updates.name = dto.name.trim();
  if (dto.industry !== undefined) updates.industry = dto.industry.trim() || null;
  if (dto.website !== undefined) updates.website = dto.website.trim() || null;
  if (dto.logoUrl !== undefined) updates.logoUrl = dto.logoUrl.trim() || null;
  if (dto.companySize !== undefined) updates.companySize = dto.companySize.trim() || null;
  if (dto.abnTaxId !== undefined) updates.abnTaxId = dto.abnTaxId.trim() || null;
  if (dto.addressLine1 !== undefined) updates.addressLine1 = dto.addressLine1.trim() || null;
  if (dto.addressLine2 !== undefined) updates.addressLine2 = dto.addressLine2.trim() || null;
  if (dto.city !== undefined) updates.city = dto.city.trim() || null;
  if (dto.state !== undefined) updates.state = dto.state.trim() || null;
  if (dto.postalCode !== undefined) updates.postalCode = dto.postalCode.trim() || null;
  if (dto.country !== undefined) updates.country = dto.country.trim() || null;
  if (dto.notes !== undefined) updates.notes = dto.notes.trim() || null;

  const [updated] = await db
    .update(schema.clients)
    .set(updates)
    .where(eq(schema.clients.id, clientId))
    .returning();

  return updated;
}

export async function deleteClient(clientId: string, userId: string) {
  await verifyClientAdminAccess(clientId, userId);
  await db.delete(schema.clients).where(eq(schema.clients.id, clientId));
}

// ---------------------------------------------------------------------------
// Contact CRUD
// ---------------------------------------------------------------------------

export async function addContact(clientId: string, userId: string, dto: CreateClientContactDTO) {
  if (!dto.name || dto.name.trim().length === 0) {
    throw new Error('Contact name is required.');
  }

  await verifyClientAccess(clientId, userId);

  const [contact] = await db
    .insert(schema.clientContacts)
    .values({
      clientId,
      name: dto.name.trim(),
      email: dto.email?.trim() ?? null,
      phone: dto.phone?.trim() ?? null,
      role: dto.role?.trim() ?? null,
      isPrimary: dto.isPrimary ?? false,
    })
    .returning();

  return contact;
}

export async function updateContact(
  clientId: string,
  userId: string,
  contactId: string,
  dto: UpdateClientContactDTO,
) {
  await verifyClientAccess(clientId, userId);

  const [existing] = await db
    .select()
    .from(schema.clientContacts)
    .where(
      and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)),
    )
    .limit(1);

  if (!existing) throw new NotFoundError('Contact not found.');

  const updates: Partial<typeof schema.clientContacts.$inferInsert> = {};
  if (dto.name !== undefined) updates.name = dto.name.trim();
  if (dto.email !== undefined) updates.email = dto.email.trim() || null;
  if (dto.phone !== undefined) updates.phone = dto.phone.trim() || null;
  if (dto.role !== undefined) updates.role = dto.role.trim() || null;
  if (dto.isPrimary !== undefined) updates.isPrimary = dto.isPrimary;

  const [updated] = await db
    .update(schema.clientContacts)
    .set(updates)
    .where(eq(schema.clientContacts.id, contactId))
    .returning();

  return updated;
}

export async function deleteContact(clientId: string, userId: string, contactId: string) {
  await verifyClientAccess(clientId, userId);

  const [existing] = await db
    .select({ id: schema.clientContacts.id })
    .from(schema.clientContacts)
    .where(
      and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)),
    )
    .limit(1);

  if (!existing) throw new NotFoundError('Contact not found.');

  await db.delete(schema.clientContacts).where(eq(schema.clientContacts.id, contactId));
}

// ---------------------------------------------------------------------------
// Contract CRUD
// ---------------------------------------------------------------------------

export async function addContract(clientId: string, userId: string, dto: CreateClientContractDTO) {
  if (!dto.name || dto.name.trim().length === 0) {
    throw new Error('Contract name is required.');
  }

  await verifyClientAccess(clientId, userId);

  const [contract] = await db
    .insert(schema.clientContracts)
    .values({
      clientId,
      name: dto.name.trim(),
      contractType: dto.contractType?.trim() ?? null,
      status: dto.status?.trim() ?? 'draft',
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      billingRate: dto.billingRate != null ? String(dto.billingRate) : null,
      billingCurrency: dto.billingCurrency?.trim() ?? 'AUD',
      slaTerms: dto.slaTerms?.trim() ?? null,
      notes: dto.notes?.trim() ?? null,
    })
    .returning();

  return contract;
}

export async function updateContract(
  clientId: string,
  userId: string,
  contractId: string,
  dto: UpdateClientContractDTO,
) {
  await verifyClientAccess(clientId, userId);

  const [existing] = await db
    .select()
    .from(schema.clientContracts)
    .where(
      and(eq(schema.clientContracts.id, contractId), eq(schema.clientContracts.clientId, clientId)),
    )
    .limit(1);

  if (!existing) throw new NotFoundError('Contract not found.');

  const updates: Partial<typeof schema.clientContracts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (dto.name !== undefined) updates.name = dto.name.trim();
  if (dto.contractType !== undefined) updates.contractType = dto.contractType.trim() || null;
  if (dto.status !== undefined) updates.status = dto.status.trim();
  if (dto.startDate !== undefined) updates.startDate = dto.startDate ?? null;
  if (dto.endDate !== undefined) updates.endDate = dto.endDate ?? null;
  if (dto.billingRate !== undefined)
    updates.billingRate = dto.billingRate != null ? String(dto.billingRate) : null;
  if (dto.billingCurrency !== undefined) updates.billingCurrency = dto.billingCurrency.trim();
  if (dto.slaTerms !== undefined) updates.slaTerms = dto.slaTerms.trim() || null;
  if (dto.notes !== undefined) updates.notes = dto.notes.trim() || null;

  const [updated] = await db
    .update(schema.clientContracts)
    .set(updates)
    .where(eq(schema.clientContracts.id, contractId))
    .returning();

  return updated;
}

export async function deleteContract(clientId: string, userId: string, contractId: string) {
  await verifyClientAccess(clientId, userId);

  const [existing] = await db
    .select({ id: schema.clientContracts.id })
    .from(schema.clientContracts)
    .where(
      and(eq(schema.clientContracts.id, contractId), eq(schema.clientContracts.clientId, clientId)),
    )
    .limit(1);

  if (!existing) throw new NotFoundError('Contract not found.');

  await db.delete(schema.clientContracts).where(eq(schema.clientContracts.id, contractId));
}
