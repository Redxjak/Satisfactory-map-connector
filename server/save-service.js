import fs from 'node:fs/promises';
import { decryptJson, encryptJson } from './crypto.js';
import { HttpError, assertFound } from './http-error.js';
import { downloadNewestSave } from './sftp.js';

function publicConnection(row) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    remoteDir: row.remote_dir,
    active: row.active,
    latestSaveName: row.latest_save_name,
    latestSaveBytes: row.latest_save_bytes,
    latestSaveModifiedAt: row.latest_save_modified_at,
    lastPulledAt: row.last_pulled_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function storagePath(userId, connectionId) {
  return `${userId}/${connectionId}/latest.sav`;
}

function normalizeConnectionInput(input) {
  const normalized = { ...input };
  const rawHost = normalized.host;
  if (!rawHost) return normalized;

  try {
    const url = rawHost.includes('://') ? new URL(rawHost) : null;
    if (url?.hostname) {
      normalized.host = url.hostname;
      if (url.port) normalized.port = Number(url.port);
      return normalized;
    }
  } catch {
    // Fall through to simple host:port handling.
  }

  const hostPort = rawHost.match(/^([^:/\s]+):(\d{1,5})$/);
  if (hostPort) {
    normalized.host = hostPort[1];
    normalized.port = Number(hostPort[2]);
  }

  return normalized;
}

export async function listConnections(supabase, user) {
  const { data, error } = await supabase
    .from('server_connections')
    .select('*')
    .eq('owner_key', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(publicConnection);
}

export async function getConnection(supabase, user, id) {
  const { data, error } = await supabase
    .from('server_connections')
    .select('*')
    .eq('owner_key', user.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return assertFound(data, 'Connection not found');
}

export async function createConnection(supabase, config, user, input) {
  const normalizedInput = normalizeConnectionInput(input);
  const credentialsEncrypted = encryptJson(
    {
      password: normalizedInput.password,
    },
    config.encryptionKey,
  );

  const { data, error } = await supabase
    .from('server_connections')
    .insert({
      owner_key: user.id,
      name: normalizedInput.name,
      host: normalizedInput.host,
      port: normalizedInput.port,
      username: normalizedInput.username,
      remote_dir: normalizedInput.remoteDir,
      active: normalizedInput.active,
      credentials_encrypted: credentialsEncrypted,
    })
    .select('*')
    .single();

  if (error) throw error;
  return publicConnection(data);
}

export async function updateConnection(supabase, config, user, id, input) {
  const normalizedInput = normalizeConnectionInput(input);
  const patch = {};
  if (normalizedInput.name !== undefined) patch.name = normalizedInput.name;
  if (normalizedInput.host !== undefined) patch.host = normalizedInput.host;
  if (normalizedInput.port !== undefined) patch.port = normalizedInput.port;
  if (normalizedInput.username !== undefined) patch.username = normalizedInput.username;
  if (normalizedInput.remoteDir !== undefined) patch.remote_dir = normalizedInput.remoteDir;
  if (normalizedInput.active !== undefined) patch.active = normalizedInput.active;
  if (normalizedInput.password !== undefined) {
    patch.credentials_encrypted = encryptJson(
      { password: normalizedInput.password },
      config.encryptionKey,
    );
  }

  const { data, error } = await supabase
    .from('server_connections')
    .update(patch)
    .eq('owner_key', user.id)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return publicConnection(assertFound(data, 'Connection not found'));
}

export async function deleteConnection(supabase, user, id) {
  const { error } = await supabase
    .from('server_connections')
    .delete()
    .eq('owner_key', user.id)
    .eq('id', id);
  if (error) throw error;
  return { ok: true };
}

export async function pullConnection(supabase, config, user, id) {
  const row = await getConnection(supabase, user, id);
  return pullConnectionRow(supabase, config, row);
}

export async function pullConnectionRow(supabase, config, row) {
  const credentials = decryptJson(row.credentials_encrypted, config.encryptionKey);
  let save;

  try {
    save = await downloadNewestSave({
      host: row.host,
      port: row.port,
      username: row.username,
      password: credentials.password,
      remoteDir: row.remote_dir,
    });

    const file = await fs.readFile(save.localPath);
    const ownerKey = row.owner_key || row.user_id;
    const objectPath = storagePath(ownerKey, row.id);
    const upload = await supabase.storage.from(config.saveBucket).upload(objectPath, file, {
      contentType: 'application/octet-stream',
      cacheControl: '60',
      upsert: true,
    });
    if (upload.error) throw upload.error;

    const snapshot = {
      owner_key: ownerKey,
      connection_id: row.id,
      save_name: save.name,
      save_bytes: save.bytes,
      save_modified_at: save.modifiedAt,
      storage_path: objectPath,
    };
    const { error: snapshotError } = await supabase.from('save_snapshots').insert(snapshot);
    if (snapshotError) throw snapshotError;

    const { data, error } = await supabase
      .from('server_connections')
      .update({
        latest_save_name: save.name,
        latest_save_bytes: save.bytes,
        latest_save_modified_at: save.modifiedAt,
        latest_storage_path: objectPath,
        last_pulled_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', row.id)
      .select('*')
      .single();

    if (error) throw error;
    return publicConnection(data);
  } catch (error) {
    await supabase
      .from('server_connections')
      .update({ last_error: error.message, last_pulled_at: new Date().toISOString() })
      .eq('id', row.id);
    throw error;
  } finally {
    if (save?.cleanup) await save.cleanup();
  }
}

export async function createScimLink(supabase, config, user, id) {
  const row = await getConnection(supabase, user, id);
  if (!row.latest_storage_path) {
    throw new HttpError(409, 'Pull the latest save before creating a SCIM link');
  }

  const { data, error } = await supabase.storage
    .from(config.saveBucket)
    .createSignedUrl(row.latest_storage_path, config.signedUrlTtlSeconds, {
      download: row.latest_save_name || 'latest.sav',
    });
  if (error) throw error;

  const saveUrl = new URL(data.signedUrl, config.supabaseUrl).toString();
  const scimUrl = `https://satisfactory-calculator.com/en/interactive-map?url=${encodeURIComponent(saveUrl)}`;
  return {
    saveUrl,
    scimUrl,
    expiresInSeconds: config.signedUrlTtlSeconds,
    saveName: row.latest_save_name,
  };
}

export async function refreshActiveConnections(supabase, config) {
  const { data, error } = await supabase
    .from('server_connections')
    .select('*')
    .eq('active', true);
  if (error) throw error;

  const results = [];
  for (const row of data) {
    try {
      const updated = await pullConnectionRow(supabase, config, row);
      results.push({ id: row.id, ok: true, saveName: updated.latestSaveName });
    } catch (error) {
      results.push({ id: row.id, ok: false, error: error.message });
    }
  }
  return results;
}
