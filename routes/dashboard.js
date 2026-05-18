/**
 * Dashboard routes — token-gated office/agent overview (JWT protected).
 *
 * GET /dashboard/:wallet
 *   Returns the office row, its agents (each with latest state), and
 *   aggregate state counts. The JWT wallet must match the path wallet.
 */
import { supabase } from '../lib/supabase.js';
import { VALID_STATES } from '../lib/stateMapper.js';

export default async function dashboardRoutes(app) {
  app.get(
    '/dashboard/:wallet',
    { preHandler: app.verifyJWT },
    async (request, reply) => {
      const { wallet } = request.params;

      // --- Authz — the token must belong to the requested wallet ---------
      if (request.user.wallet !== wallet) {
        return reply
          .code(403)
          .send({ ok: false, error: 'Forbidden — wallet mismatch' });
      }

      // --- 1. Fetch office + agents in parallel --------------------------
      const [officeRes, agentsRes] = await Promise.all([
        supabase.from('offices').select('*').eq('wallet', wallet).maybeSingle(),
        supabase
          .from('agents')
          .select('id, name, avatar_seed, created_at, last_seen_at')
          .eq('wallet', wallet),
      ]);

      if (officeRes.error) {
        request.log.error(officeRes.error, 'Supabase office query failed');
        return reply
          .code(500)
          .send({ ok: false, error: officeRes.error.message });
      }
      if (agentsRes.error) {
        request.log.error(agentsRes.error, 'Supabase agents query failed');
        return reply
          .code(500)
          .send({ ok: false, error: agentsRes.error.message });
      }

      const office = officeRes.data;
      const agents = agentsRes.data || [];

      // --- 2. Fetch latest state for each agent --------------------------
      const stateMap = {};
      if (agents.length > 0) {
        const agentIds = agents.map((a) => a.id);
        const statesRes = await supabase
          .from('agent_states_latest')
          .select('*')
          .in('agent_id', agentIds);

        if (statesRes.error) {
          request.log.error(
            statesRes.error,
            'Supabase agent_states_latest query failed'
          );
          return reply
            .code(500)
            .send({ ok: false, error: statesRes.error.message });
        }

        for (const row of statesRes.data || []) {
          stateMap[row.agent_id] = row;
        }
      }

      // --- 3. Merge latest state onto each agent -------------------------
      const mergedAgents = agents.map((agent) => {
        const state = stateMap[agent.id];
        return {
          id: agent.id,
          name: agent.name,
          avatar_seed: agent.avatar_seed,
          created_at: agent.created_at,
          last_seen_at: agent.last_seen_at,
          latest_state: state
            ? {
                state: state.state,
                zone: state.zone,
                task: state.task,
                updated_at: state.updated_at,
              }
            : null,
        };
      });

      // --- 4. Aggregate state counts (0 for unseen states) ---------------
      const byState = {};
      for (const s of VALID_STATES) byState[s] = 0;
      for (const agent of mergedAgents) {
        const s = agent.latest_state?.state;
        if (s) byState[s] = (byState[s] || 0) + 1;
      }

      return {
        ok: true,
        wallet,
        office: office || null,
        agents: mergedAgents,
        stats: {
          total_agents: mergedAgents.length,
          by_state: byState,
        },
      };
    }
  );
}
