import type { Request, Response, NextFunction } from 'express';
import * as clientService from '../services/client.service.js';
import { UnauthorizedError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { orgId } = req.query as { orgId?: string };
    if (!orgId) {
      res.status(400).json({ success: false, error: 'orgId query parameter is required.' });
      return;
    }
    const data = await clientService.listClients(orgId, req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createClient(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const orgId =
      (req.body as { orgId?: string; organisationId?: string }).orgId ??
      (req.body as { organisationId?: string }).organisationId;
    if (!orgId) {
      res.status(400).json({ success: false, error: 'organisationId is required.' });
      return;
    }
    const client = await clientService.createClient(orgId, req.user.userId, req.body);
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
}

export async function getClient(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const client = await clientService.getClient(req.params.clientId, req.user.userId);
    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
}

export async function updateClient(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const client = await clientService.updateClient(req.params.clientId, req.user.userId, req.body);
    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
}

export async function deleteClient(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await clientService.deleteClient(req.params.clientId, req.user.userId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function addContact(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const contact = await clientService.addContact(req.params.clientId, req.user.userId, req.body);
    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const contact = await clientService.updateContact(
      req.params.clientId,
      req.user.userId,
      req.params.contactId,
      req.body,
    );
    res.json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await clientService.deleteContact(req.params.clientId, req.user.userId, req.params.contactId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export async function addContract(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const contract = await clientService.addContract(
      req.params.clientId,
      req.user.userId,
      req.body,
    );
    res.status(201).json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
}

export async function updateContract(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const contract = await clientService.updateContract(
      req.params.clientId,
      req.user.userId,
      req.params.contractId,
      req.body,
    );
    res.json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
}

export async function deleteContract(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    await clientService.deleteContract(req.params.clientId, req.user.userId, req.params.contractId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}
