import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdmin(config) {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
