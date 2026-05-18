/**
 * Health check route.
 * GET /health → liveness/readiness probe used by Railway.
 */
import { supabase } from '../lib/supabase.js';

export default async function healthRoutes(app) {
  app.get('/health', async () => {
    // Supabase: cheap connectivity probe (count-only, no rows returned).
    let supabaseStatus = 'ok';
    try {
      const { error } = await supabase
        .from('offices')
        .select('*', { count: 'exact', head: true });
      if (error) supabaseStatus = 'error';
    } catch {
      supabaseStatus = 'error';
    }

    // Helius: not pinged (rate limits) — just report config presence.
    const heliusStatus = process.env.HELIUS_API_KEY ? 'configured' : 'missing';

    return {
      ok: true,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        supabase: supabaseStatus,
        helius: heliusStatus,
      },
    };
  });
}
