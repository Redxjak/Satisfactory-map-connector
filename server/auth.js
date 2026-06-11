import { HttpError } from './http-error.js';

export async function authenticateRequest(req, supabase) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Invalid session');

  const email = data.user.email?.toLowerCase();
  if (!email) throw new HttpError(403, 'Signed-in user has no email');

  const { data: allowed, error: allowedError } = await supabase
    .from('allowed_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (allowedError) throw allowedError;
  if (!allowed) throw new HttpError(403, 'This email is not invited');

  return {
    id: data.user.id,
    email,
  };
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
