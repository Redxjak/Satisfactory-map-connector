import express from 'express';
import {
  createCodeSession,
  createOwnerAccountSession,
  createOwnerLoginSession,
  deleteCurrentSession,
  requireOwner,
  requireUser,
} from './auth.js';
import {
  createPlayerAccessCode,
  deletePlayerAccessCode,
  listPlayerAccessCodes,
  updatePlayerAccessCode,
} from './access-codes.js';
import {
  createConnection,
  createScimLink,
  deleteConnection,
  listConnections,
  pullConnection,
  updateConnection,
} from './save-service.js';
import {
  accountLoginSchema,
  accountSignupSchema,
  connectionSchema,
  createAccessCodeSchema,
  loginSchema,
  parseBody,
  updateAccessCodeSchema,
  updateConnectionSchema,
} from './validation.js';

export function createRouter(config) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'satisfactory-map-connector-api' });
  });

  router.post('/auth/login', async (req, res, next) => {
    try {
      const input = parseBody(loginSchema, req.body);
      const session = await createCodeSession(req.app.locals.supabase, config, input.code);
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/signup', async (req, res, next) => {
    try {
      const input = parseBody(accountSignupSchema, req.body);
      const session = await createOwnerAccountSession(req.app.locals.supabase, config, input);
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/account-login', async (req, res, next) => {
    try {
      const input = parseBody(accountLoginSchema, req.body);
      const session = await createOwnerLoginSession(req.app.locals.supabase, config, input);
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/auth/logout',
    requireUser(async (req, res) => {
      await deleteCurrentSession(req, req.app.locals.supabase);
      res.status(204).end();
    }),
  );

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
    requireOwner(async (req, res) => {
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
    requireOwner(async (req, res) => {
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
    requireOwner(async (req, res) => {
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

  router.get(
    '/access-codes',
    requireOwner(async (req, res) => {
      const accessCodes = await listPlayerAccessCodes(req.app.locals.supabase, req.user);
      res.json({ accessCodes });
    }),
  );

  router.post(
    '/access-codes',
    requireOwner(async (req, res) => {
      const input = parseBody(createAccessCodeSchema, req.body);
      const result = await createPlayerAccessCode(req.app.locals.supabase, req.user, input);
      res.status(201).json(result);
    }),
  );

  router.patch(
    '/access-codes/:id',
    requireOwner(async (req, res) => {
      const input = parseBody(updateAccessCodeSchema, req.body);
      const accessCode = await updatePlayerAccessCode(
        req.app.locals.supabase,
        req.user,
        req.params.id,
        input,
      );
      res.json({ accessCode });
    }),
  );

  router.delete(
    '/access-codes/:id',
    requireOwner(async (req, res) => {
      await deletePlayerAccessCode(req.app.locals.supabase, req.user, req.params.id);
      res.status(204).end();
    }),
  );

  return router;
}
