import { HttpError } from './http-error.js';
import crypto from 'node:crypto';

export function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
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
      role: accessCode.role || 'player',
      authType: 'code',
    },
  };
}

export async function createOwnerAccountSession(supabase, config, input) {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = passwordHash(input.password, salt);

  const { data: account, error: accountError } = await supabase
    .from('owner_accounts')
    .insert({
      email,
      display_name: displayName,
      password_salt: salt,
      password_hash: hash,
    })
    .select('*')
    .single();

  if (accountError?.code === '23505') throw new HttpError(409, 'An account already exists for that email');
  if (accountError) throw accountError;

  if (input.claimCode?.trim()) {
    await claimExistingCodeOwner(supabase, account.id, input.claimCode.trim());
  }

  return createOwnerSessionForAccount(supabase, config, account);
}

async function claimExistingCodeOwner(supabase, ownerAccountId, code) {
  const { data: accessCode, error } = await supabase
    .from('access_codes')
    .select('owner_key')
    .eq('code_hash', sha256(code))
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  if (!accessCode) throw new HttpError(400, 'Claim code was not found');

  const oldOwnerKey = accessCode.owner_key;

  const updates = [
    supabase.from('server_connections').update({ owner_key: ownerAccountId }).eq('owner_key', oldOwnerKey),
    supabase.from('save_snapshots').update({ owner_key: ownerAccountId }).eq('owner_key', oldOwnerKey),
    supabase.from('access_codes').update({ owner_key: ownerAccountId }).eq('owner_key', oldOwnerKey),
  ];

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
}

export async function createOwnerLoginSession(supabase, config, input) {
  const email = input.email.trim().toLowerCase();
  const { data: account, error } = await supabase
    .from('owner_accounts')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  if (!account) throw new HttpError(401, 'Invalid email or password');

  const attemptedHash = passwordHash(input.password, account.password_salt);
  const expected = Buffer.from(account.password_hash, 'hex');
  const actual = Buffer.from(attemptedHash, 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new HttpError(401, 'Invalid email or password');
  }

  return createOwnerSessionForAccount(supabase, config, account);
}

async function createOwnerSessionForAccount(supabase, config, account) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const expiresAt = sessionExpiry(config);

  const { error } = await supabase.from('owner_sessions').insert({
    owner_account_id: account.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) throw error;

  return {
    token,
    expiresAt,
    user: {
      id: account.id,
      label: account.display_name,
      email: account.email,
      role: 'owner',
      authType: 'account',
    },
  };
}

export async function authenticateRequest(req, supabase) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  const { data: ownerSession, error: ownerSessionError } = await supabase
    .from('owner_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .gt('expires_at', now)
    .maybeSingle();

  if (ownerSessionError) throw ownerSessionError;
  if (ownerSession) {
    const { data: account, error: accountError } = await supabase
      .from('owner_accounts')
      .select('email, display_name')
      .eq('id', ownerSession.owner_account_id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) throw new HttpError(401, 'Invalid or expired session');

    req.sessionTokenHash = tokenHash;
    req.sessionTable = 'owner_sessions';

    return {
      id: ownerSession.owner_account_id,
      label: account.display_name,
      email: account.email,
      role: 'owner',
      authType: 'account',
      expiresAt: ownerSession.expires_at,
    };
  }

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
    .select('label, active, role')
    .eq('id', session.access_code_id)
    .maybeSingle();

  if (codeError) throw codeError;
  if (!accessCode?.active) throw new HttpError(403, 'Access code is disabled');

  req.sessionTokenHash = tokenHash;
  req.sessionTable = 'app_sessions';

  return {
    id: session.owner_key,
    label: accessCode.label,
    role: accessCode.role || 'player',
    authType: 'code',
    expiresAt: session.expires_at,
  };
}

export async function deleteCurrentSession(req, supabase) {
  if (!req.sessionTokenHash) return;
  const table = req.sessionTable === 'owner_sessions' ? 'owner_sessions' : 'app_sessions';
  const { error } = await supabase
    .from(table)
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

export function requireOwner(handler) {
  return requireUser(async (req, res, next) => {
    if (req.user.role !== 'owner') throw new HttpError(403, 'Owner access required');
    await handler(req, res, next);
  });
}
