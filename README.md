# Pixclof API

Backend for the **Pixclof** token-gated dashboard.

- Public site: [pixclof.xyz](https://pixclof.xyz)
- Dashboard (token-gated): [dashboard.pixclof.xyz](https://dashboard.pixclof.xyz)
- Token: `$PIXCLOF` on Solana (via pump.fun) — mint CA is TBA at launch.
- Dashboard access requires holding at least **10,000 $PIXCLOF**.

The API verifies Solana wallet ownership via signed messages, checks
`$PIXCLOF` holdings through the Helius RPC, issues JWTs for the dashboard,
and stores agent/office state in Supabase.

## Stack

- Node.js 20+ (ES Modules)
- Fastify 4
- Supabase (`@supabase/supabase-js`)
- Solana wallet verification (`@solana/web3.js`, `tweetnacl`, `bs58`)
- JWT (`jsonwebtoken`)
- Helius RPC (via native `fetch`)
- `@fastify/cors`, `@fastify/rate-limit`

## Local development

```bash
cp .env.example .env   # then fill in the values
npm install
npm run dev            # starts with --watch on http://localhost:3000
```

Quick health check:

```bash
npm run test:health    # curl http://localhost:3000/health
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor**, paste the contents of [`sql/schema.sql`](sql/schema.sql), and run it.
3. Copy your project URL and **service-role** key into `.env`
   (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). The service-role key bypasses
   RLS — keep it server-side only.

## Helius setup

1. Create an account at [helius.dev](https://helius.dev).
2. Create an API key and put it in `.env` as `HELIUS_API_KEY`.
3. Set `PIXCLOF_MINT` once the token launches (placeholder `TBA` until then).

## Railway deploy

```bash
railway login
railway init          # or: railway link  (to attach an existing project)
railway up
```

Then set the environment variables (see `.env.example`) in the Railway
dashboard. Railway provides `PORT`; the server binds to `0.0.0.0`.
`railway.toml` configures the Nixpacks build and the `/health` healthcheck.

## Endpoints

| Method | Path                   | Auth     | Description                                      |
|--------|------------------------|----------|--------------------------------------------------|
| GET    | `/health`              | none     | Liveness probe — `{ ok, version, timestamp, uptime }` |
| POST   | `/auth/verify-wallet`  | none     | Verify wallet signature + holdings, issue JWT    |
| GET    | `/dashboard/:wallet`   | JWT      | Office + agents overview for a wallet            |
| POST   | `/agents`              | JWT      | Register a new agent under the office            |
| GET    | `/agents`              | JWT      | List agents for the authenticated office         |
| POST   | `/agents/heartbeat`    | API key  | Agent pushes its current state (`pxc_...` key)   |

### Request bodies

| Endpoint                | Body (JSON)                                                        |
|-------------------------|--------------------------------------------------------------------|
| `POST /auth/verify-wallet` | `{ wallet, message, signature }`                                 |
| `POST /agents`          | `{ name, avatarSeed }`                                             |
| `POST /agents/heartbeat`| `{ agentId, state, task, metadata }` + header `x-api-key: pxc_...` |

> Routes other than `/health` are currently stubs returning mock responses.
> Real logic is implemented in subsequent steps (10B/10C/10D).

## License

MIT

