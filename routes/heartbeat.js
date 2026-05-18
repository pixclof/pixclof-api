/**
 * Heartbeat route — agents push their current state here (API key auth).
 * Higher rate limit than the global default since agents poll frequently.
 *
 * POST /agents/heartbeat
 *   Auth: `Authorization: Bearer pxc_...` (agent API key, not a JWT).
 *   Records the state in history (agent_states), refreshes the denormalized
 *   latest-state row, and bumps the agent's last_seen_at.
 */
import { supabase } from '../lib/supabase.js';
import { verifyApiKey } from '../lib/apiKey.js';
import {
  isValidState,
  mapStateToZone,
  VALID_STATES,
} from '../lib/stateMapper.js';

const heartbeatSchema = {
  body: {
    type: 'object',
    required: ['agent_id', 'state'],
    additionalProperties: false,
    properties: {
      agent_id: { type: 'string', format: 'uuid' },
      state: { type: 'string' },
      task: { type: 'string', maxLength: 200 },
      metadata: { type: 'object' },
    },
  },
};

export default async function heartbeatRoutes(app) {
  app.post(
    '/agents/heartbeat',
    {
      schema: heartbeatSchema,
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { agent_id, state, task, metadata } = request.body;

      // --- 1. Extract the API key from the Authorization header ---------
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply
          .code(401)
          .send({ ok: false, error: 'Missing or invalid API key' });
      }
      const plainKey = authHeader.slice('Bearer '.length).trim();
      if (!plainKey || !plainKey.startsWith('pxc_')) {
        return reply
          .code(401)
          .send({ ok: false, error: 'Missing or invalid API key' });
      }

      // --- 2. Look up the agent -----------------------------------------
      const { data: agent, error: lookupError } = await supabase
        .from('agents')
        .select('id, wallet, api_key_hash')
        .eq('id', agent_id)
        .maybeSingle();

      if (lookupError) {
        request.log.error(lookupError, 'Supabase agent lookup failed');
        return reply
          .code(500)
          .send({ ok: false, error: lookupError.message });
      }
      if (!agent) {
        return reply
          .code(404)
          .send({ ok: false, error: 'Agent not found' });
      }

      // --- 3. Verify the API key ----------------------------------------
      if (!verifyApiKey(plainKey, agent.api_key_hash)) {
        return reply
          .code(401)
          .send({ ok: false, error: 'Invalid API key' });
      }

      // --- 4. Validate the reported state -------------------------------
      if (!isValidState(state)) {
        return reply.code(400).send({
          ok: false,
          error: 'Invalid state',
          validStates: VALID_STATES,
        });
      }

      // --- 5. Map state → zone ------------------------------------------
      const zone = mapStateToZone(state);
      const now = new Date().toISOString();

      // --- 6. Persist: history insert + latest upsert + last_seen bump --
      const [historyRes, latestRes, agentRes] = await Promise.all([
        supabase
          .from('agent_states')
          .insert({ agent_id, state, zone, task, metadata }),
        supabase.from('agent_states_latest').upsert(
          { agent_id, state, zone, task, metadata, updated_at: now },
          { onConflict: 'agent_id' }
        ),
        supabase
          .from('agents')
          .update({ last_seen_at: now })
          .eq('id', agent_id),
      ]);

      const writeError =
        historyRes.error || latestRes.error || agentRes.error;
      if (writeError) {
        request.log.error(writeError, 'Supabase heartbeat write failed');
        return reply
          .code(500)
          .send({ ok: false, error: writeError.message });
      }

      // --- 7. Respond ---------------------------------------------------
      return {
        ok: true,
        agent_id,
        state,
        zone,
        updated_at: now,
      };
    }
  );
}
