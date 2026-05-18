import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Missing Supabase config: set SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment.'
  );
}

/**
 * Supabase client initialized with the service-role key.
 * This key bypasses RLS — keep it server-side only, never expose to clients.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    // Node 20 ships no global WebSocket; supabase-js auto-inits RealtimeClient
    // even though this backend only uses the REST API. Inject `ws` so that
    // init doesn't crash with "Node.js 20 detected without native WebSocket support."
    transport: ws,
  },
});
