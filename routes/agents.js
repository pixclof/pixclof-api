/**
 * Agent routes — register, list, inspect, delete agents and rotate API keys
 * for an office (all JWT protected, scoped to the caller's wallet).
 *
 * POST   /agents              register a new agent (returns api_key ONCE)
 * GET    /agents              list the caller's agents
 * GET    /agents/:id          inspect one agent (+ latest state)
 * DELETE /agents/:id          delete an agent (cascades to its states)
 * POST   /agents/:id/rotate-key  issue a fresh api_key, invalidating the old one
 */
import crypto from 'node:crypto';
import { supabase } from '../lib/supabase.js';
import { generateApiKey, hashApiKey } from '../lib/apiKey.js';

const createAgentSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      avatar_seed: { type: 'string', maxLength: 50 },
    },
  },
};

/**
 * Load an agent by id and verify it belongs to the caller's wallet.
 * Returns { agent } on success, or { reply } describing a 403/404/500.
 */
async function loadOwnedAgent(request, agentId) {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .maybeSingle();

  if (error) {
    request.log.error(error, 'Supabase agent lookup failed');
    return { error: { code: 500, body: { ok: false, error: error.message } } };
  }
  if (!agent) {
    return {
      error: { code: 404, body: { ok: false, error: 'Agent not found' } },
    };
  }
  if (agent.wallet !== request.user.wallet) {
    return {
      error: { code: 403, body: { ok: false, error: 'Forbidden' } },
    };
  }
  return { agent };
}

export default async function agentsRoutes(app, opts) {
  // --- ENDPOINT 1: register a new agent ---------------------------------
  app.post(
    '/agents',
    { preHandler: app.verifyJWT, schema: createAgentSchema },
    async (request, reply) => {
      const { name } = request.body;
      const avatar_seed =
        request.body.avatar_seed || crypto.randomBytes(4).toString('hex');

      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);

      const { data: agent, error } = await supabase
        .from('agents')
        .insert({
          wallet: request.user.wallet,
          name,
          avatar_seed,
          api_key_hash: apiKeyHash,
        })
        .select()
        .single();

      if (error) {
        request.log.error(error, 'Supabase agent insert failed');
        return reply.code(500).send({ ok: false, error: error.message });
      }

      // api_key is returned exactly once — only the hash is persisted.
      return reply.code(201).send({
        ok: true,
        agent: {
          id: agent.id,
          name: agent.name,
          avatar_seed: agent.avatar_seed,
          created_at: agent.created_at,
        },
        api_key: apiKey,
      });
    }
  );

  // --- ENDPOINT 2: list the caller's agents -----------------------------
  app.get(
    '/agents',
    { preHandler: app.verifyJWT },
    async (request, reply) => {
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, avatar_seed, created_at, last_seen_at')
        .eq('wallet', request.user.wallet)
        .order('created_at', { ascending: false });

      if (error) {
        request.log.error(error, 'Supabase agents query failed');
        return reply.code(500).send({ ok: false, error: error.message });
      }

      return { ok: true, agents: agents || [] };
    }
  );

  // --- ENDPOINT 3: inspect one agent (+ latest state) -------------------
  app.get(
    '/agents/:id',
    { preHandler: app.verifyJWT },
    async (request, reply) => {
      const { agent, error } = await loadOwnedAgent(request, request.params.id);
      if (error) return reply.code(error.code).send(error.body);

      const { data: state, error: stateError } = await supabase
        .from('agent_states_latest')
        .select('*')
        .eq('agent_id', agent.id)
        .maybeSingle();

      if (stateError) {
        request.log.error(stateError, 'Supabase latest-state query failed');
        return reply.code(500).send({ ok: false, error: stateError.message });
      }

      return {
        ok: true,
        agent: {
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
        },
      };
    }
  );

  // --- ENDPOINT 4: delete an agent --------------------------------------
  app.delete(
    '/agents/:id',
    { preHandler: app.verifyJWT },
    async (request, reply) => {
      const { agent, error } = await loadOwnedAgent(request, request.params.id);
      if (error) return reply.code(error.code).send(error.body);

      // FK ON DELETE CASCADE cleans up agent_states + agent_states_latest.
      const { error: deleteError } = await supabase
        .from('agents')
        .delete()
        .eq('id', agent.id);

      if (deleteError) {
        request.log.error(deleteError, 'Supabase agent delete failed');
        return reply.code(500).send({ ok: false, error: deleteError.message });
      }

      return { ok: true, deleted: true };
    }
  );

  // --- ENDPOINT 5: rotate an agent's API key ----------------------------
  app.post(
    '/agents/:id/rotate-key',
    { preHandler: app.verifyJWT },
    async (request, reply) => {
      const { agent, error } = await loadOwnedAgent(request, request.params.id);
      if (error) return reply.code(error.code).send(error.body);

      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);

      const { error: updateError } = await supabase
        .from('agents')
        .update({ api_key_hash: apiKeyHash })
        .eq('id', agent.id);

      if (updateError) {
        request.log.error(updateError, 'Supabase api-key rotation failed');
        return reply.code(500).send({ ok: false, error: updateError.message });
      }

      // Returned once — the old key is now invalid.
      return { ok: true, api_key: apiKey };
    }
  );
}
