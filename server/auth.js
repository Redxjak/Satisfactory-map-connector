import { HttpError } from './http-error.js';
import crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function bearerToken(req) {
  const header = req.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

function sessionExpiry(config) {
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

export async function createCodeSession(supabase, config, code) {
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new HttpError(400, 'Access code is required');

  const { data: accessCode, error: codeError } = await supabase
    .from('access_codes')
    .select('*')
    .eq('code_hash', sha256(normalizedCode))
    .eq('active', true)
    .maybeSingle();

  if (codeError) throw codeError;
  if (!accessCode) throw new HttpError(401, 'Invalid access code');

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const expiresAt = sessionExpiry(config);

  const { error: sessionError } = await supabase.from('app_sessions').insert({
    access_code_id: accessCode.id,
    owner_key: accessCode.owner_key,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (sessionError) throw sessionError;

  return {
    token,
    expiresAt,
    user: {
      id: accessCode.owner_key,
      label: accessCode.label,
    },
  };
}

export async function authenticateRequest(req, supabase) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  const { data: session, error: sessionError } = await supabase
    .from('app_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .gt('expires_at', now)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) throw new HttpError(401, 'Invalid or expired session');

  const { data: accessCode, error: codeError } = await supabase
    .from('access_codes')
    .select('label, active')
    .eq('id', session.access_code_id)
    .maybeSingle();

  if (codeError) throw codeError;
  if (!accessCode?.active) throw new HttpError(403, 'Access code is disabled');

  req.sessionTokenHash = tokenHash;

  return {
    id: session.owner_key,
    label: accessCode.label,
    expiresAt: session.expires_at,
  };
}

export async function deleteCurrentSession(req, supabase) {
  if (!req.sessionTokenHash) return;
  const { error } = await supabase
    .from('app_sessions')
    .delete()
    .eq('token_hash', req.sessionTokenHash);
  if (error) throw error;
}

export function requireUser(handler) {
  return async (req, res, next) => {
    try {
      req.user = await authenticateRequest(req, req.app.locals.supabase);
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}
