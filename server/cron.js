import { createConfig } from './config.js';
import { refreshActiveConnections } from './save-service.js';
import { createSupabaseAdmin } from './supabase.js';

const config = createConfig();
const supabase = createSupabaseAdmin(config);
const results = await refreshActiveConnections(supabase, config);

console.log(JSON.stringify({ refreshedAt: new Date().toISOString(), results }, null, 2));
