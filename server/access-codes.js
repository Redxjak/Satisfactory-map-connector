import crypto from 'node:crypto';
import { sha256 } from './auth.js';
import { HttpError, assertFound } from './http-error.js';

function publicAccessCode(row) {
  return {
    id: row.id,
    label: row.label,
    active: row.active,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function randomPlayerCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function listPlayerAccessCodes(supabase, user) {
  const { data, error } = await supabase
    .from('access_codes')
    .select('id, label, active, role, created_at, updated_at')
    .eq('owner_key', user.id)
    .eq('role', 'player')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data.map(publicAccessCode);
}

export async function createPlayerAccessCode(supabase, user, input) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = input.code || randomPlayerCode();
    const { data, error } = await supabase
      .from('access_codes')
      .insert({
        owner_key: user.id,
        label: input.label,
        code_hash: sha256(code),
        role: 'player',
        active: true,
      })
      .select('id, label, active, role, created_at, updated_at')
      .single();

    if (!error) {
      return {
        accessCode: publicAccessCode(data),
        code,
      };
    }

    if (error.code !== '23505' || input.code) {
      throw error.code === '23505'
        ? new HttpError(409, 'That access code is already in use')
        : error;
    }
  }

  throw new HttpError(409, 'Could not generate a unique access code');
}

export async function updatePlayerAccessCode(supabase, user, id, input) {
  const patch = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.active !== undefined) patch.active = input.active;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('access_codes')
    .update(patch)
    .eq('id', id)
    .eq('owner_key', user.id)
    .eq('role', 'player')
    .select('id, label, active, role, created_at, updated_at')
    .maybeSingle();

  if (error) throw error;
  return publicAccessCode(assertFound(data, 'Access code not found'));
}

export async function deletePlayerAccessCode(supabase, user, id) {
  const { error } = await supabase
    .from('access_codes')
    .delete()
    .eq('id', id)
    .eq('owner_key', user.id)
    .eq('role', 'player');

  if (error) throw error;
  return { ok: true };
}
