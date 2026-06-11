import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function parseOrigins(value) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseEncryptionKey() {
  const raw = required('CREDENTIAL_ENCRYPTION_KEY');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;

  const hex = Buffer.from(raw, 'hex');
  if (hex.length === 32) return hex;

  throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 or hex value');
}

export function createConfig() {
  return {
    port: Number(optional('PORT', '8787')),
    frontendOrigins: parseOrigins(optional('FRONTEND_ORIGIN', 'http://localhost:5173')),
    supabaseUrl: required('SUPABASE_URL'),
    supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
    encryptionKey: parseEncryptionKey(),
    saveBucket: optional('SAVE_BUCKET', 'saves'),
    signedUrlTtlSeconds: Number(optional('SIGNED_URL_TTL_SECONDS', '1800')),
    refreshIntervalMinutes: Number(optional('REFRESH_INTERVAL_MINUTES', '30')),
  };
}

export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('base64');
}
