/**
 * Auth routes — wallet signature verification + JWT issuance.
 *
 * POST /auth/verify-wallet
 *   Verifies an ed25519 sign-in message, checks $pixclof holdings via Helius,
 *   upserts the office row, and issues a JWT.
 */
import { verifyWalletSignature, issueJWT } from '../lib/auth.js';
import { getTokenBalance } from '../lib/helius.js';
import { supabase } from '../lib/supabase.js';

// Expected sign-in message shape (prevents replay across apps + over time):
//   Sign in to Pixclof
//   Nonce: <hex>
//   Timestamp: <ISO date>
const MESSAGE_RE =
  /^Sign in to Pixclof\nNonce: ([0-9a-fA-F]+)\nTimestamp: (.+)$/;

// Reject sign-in messages whose timestamp is more than this far from now
// (in either direction — too old = replay, too far future = clock abuse).
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

const verifyWalletSchema = {
  body: {
    type: 'object',
    required: ['wallet', 'signature', 'message'],
    additionalProperties: false,
    properties: {
      wallet: { type: 'string', minLength: 32, maxLength: 44 },
      signature: { type: 'string', minLength: 1 },
      message: { type: 'string', minLength: 1 },
    },
  },
};

export default async function authRoutes(app) {
  app.post(
    '/auth/verify-wallet',
    { schema: verifyWalletSchema },
    async (request, reply) => {
      const { wallet, signature, message } = request.body;

      // --- 1. Validate message format + freshness -----------------------
      const match = MESSAGE_RE.exec(message);
      if (!match) {
        return reply
          .code(400)
          .send({ error: 'Malformed sign-in message' });
      }

      const timestamp = new Date(match[2]);
      if (Number.isNaN(timestamp.getTime())) {
        return reply
          .code(400)
          .send({ error: 'Invalid timestamp in sign-in message' });
      }

      const ageMs = Date.now() - timestamp.getTime();
      if (Math.abs(ageMs) > MAX_MESSAGE_AGE_MS) {
        return reply
          .code(400)
          .send({ error: 'Sign-in message expired' });
      }

      // --- 2. Verify the wallet signature -------------------------------
      if (!verifyWalletSignature(message, signature, wallet)) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // --- 3. Check $pixclof holdings via Helius ------------------------
      let balance;
      try {
        balance = await getTokenBalance(wallet, process.env.PIXCLOF_MINT);
      } catch (err) {
        request.log.error(err, 'Helius token balance lookup failed');
        return reply
          .code(500)
          .send({ error: 'Token balance lookup failed' });
      }

      const minHoldBalance = parseInt(process.env.MIN_HOLD_BALANCE, 10) || 0;
      const hasAccess = balance >= minHoldBalance;

      // --- 4. Upsert the office row -------------------------------------
      const { error: dbError } = await supabase
        .from('offices')
        .upsert({ wallet }, { onConflict: 'wallet' });
      if (dbError) {
        request.log.error(dbError, 'Supabase office upsert failed');
        return reply.code(500).send({ error: 'Database error' });
      }

      // --- 5. Issue the JWT ---------------------------------------------
      // `iat`/`exp` are added automatically by jsonwebtoken.
      const token = issueJWT({ wallet, balance, hasAccess });

      // Always 200, even without access — the frontend uses `hasAccess` to
      // gate features and can show a "buy more $pixclof" CTA.
      return {
        ok: true,
        wallet,
        balance,
        hasAccess,
        jwt: token,
        minHoldBalance,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      };
    }
  );
}
