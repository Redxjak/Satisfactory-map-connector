import express from 'express';
import { requireUser } from './auth.js';
import {
  createConnection,
  createScimLink,
  deleteConnection,
  listConnections,
  pullConnection,
  updateConnection,
} from './save-service.js';
import { connectionSchema, parseBody, updateConnectionSchema } from './validation.js';

export function createRouter(config) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'satisfactory-map-connector-api' });
  });

  router.get(
    '/me',
    requireUser(async (req, res) => {
      res.json({ user: req.user });
    }),
  );

  router.get(
    '/connections',
    requireUser(async (req, res) => {
      const connections = await listConnections(req.app.locals.supabase, req.user);
      res.json({ connections });
    }),
  );

  router.post(
    '/connections',
    requireUser(async (req, res) => {
      const input = parseBody(connectionSchema, req.body);
      const connection = await createConnection(
        req.app.locals.supabase,
        config,
        req.user,
        input,
      );
      res.status(201).json({ connection });
    }),
  );

  router.patch(
    '/connections/:id',
    requireUser(async (req, res) => {
      const input = parseBody(updateConnectionSchema, req.body);
      const connection = await updateConnection(
        req.app.locals.supabase,
        config,
        req.user,
        req.params.id,
        input,
      );
      res.json({ connection });
    }),
  );

  router.delete(
    '/connections/:id',
    requireUser(async (req, res) => {
      await deleteConnection(req.app.locals.supabase, req.user, req.params.id);
      res.status(204).end();
    }),
  );

  router.post(
    '/connections/:id/pull',
    requireUser(async (req, res) => {
      const connection = await pullConnection(
        req.app.locals.supabase,
        config,
        req.user,
        req.params.id,
      );
      res.json({ connection });
    }),
  );

  router.post(
    '/connections/:id/scim-link',
    requireUser(async (req, res) => {
      const link = await createScimLink(
        req.app.locals.supabase,
        config,
        req.user,
        req.params.id,
      );
      res.json({ link });
    }),
  );

  return router;
}
