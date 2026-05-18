/**
 * Auth helpers — JWT issuance/verification + Solana wallet signature checks.
 */
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Sign a JWT for the given payload.
 *
 * @param {object} payload - Claims to embed (e.g. { wallet, balance, hasAccess }).
 * @returns {string} Signed JWT. `iat` and `exp` are added automatically.
 */
export function issueJWT(payload) {
  if (!JWT_SECRET) throw new Error('Missing JWT_SECRET in environment.');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT and return its decoded payload.
 *
 * @param {string} token - JWT string.
 * @returns {object} Decoded payload.
 * @throws if invalid or expired.
 */
export function verifyJWT(token) {
  if (!JWT_SECRET) throw new Error('Missing JWT_SECRET in environment.');
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Verify an ed25519 signature produced by a Solana wallet.
 *
 * @param {string} message            - Original signed message (utf-8).
 * @param {string} signatureBase58     - Signature, base58-encoded.
 * @param {string} walletAddressBase58 - Signer public key, base58-encoded.
 * @returns {boolean} true if the signature is valid, false on any failure.
 */
export function verifyWalletSignature(message, signatureBase58, walletAddressBase58) {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signatureBase58);
    const publicKeyBytes = bs58.decode(walletAddressBase58);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Fastify preHandler — enforces a valid `Authorization: Bearer <jwt>` header.
 * On success the decoded payload is attached to `request.user`.
 * On failure it replies 401 and short-circuits the route.
 *
 * Wire it up via `app.decorate('verifyJWT', jwtAuthMiddleware)` in server.js,
 * then use `{ preHandler: app.verifyJWT }` in protected route configs
 * (e.g. dashboard.js & agents.js).
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function jwtAuthMiddleware(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return reply.code(401).send({ error: 'Missing token' });
  }

  try {
    request.user = verifyJWT(token);
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}
