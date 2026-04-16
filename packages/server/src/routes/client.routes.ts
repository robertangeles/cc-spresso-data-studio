import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as clientController from '../controllers/client.controller.js';

const router = Router();

// All client routes require authentication
router.use(authenticate);

// --- Clients ---
router.get('/', clientController.listClients);
router.post('/', clientController.createClient);
router.get('/:clientId', clientController.getClient);
router.put('/:clientId', clientController.updateClient);
router.delete('/:clientId', clientController.deleteClient);

// --- Contacts ---
router.post('/:clientId/contacts', clientController.addContact);
router.put('/:clientId/contacts/:contactId', clientController.updateContact);
router.delete('/:clientId/contacts/:contactId', clientController.deleteContact);

// --- Contracts ---
router.post('/:clientId/contracts', clientController.addContract);
router.put('/:clientId/contracts/:contractId', clientController.updateContract);
router.delete('/:clientId/contracts/:contractId', clientController.deleteContract);

export { router as clientRoutes };
