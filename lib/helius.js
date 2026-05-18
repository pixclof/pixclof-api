/**
 * Helius RPC helpers — SPL token balance lookups.
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Get the UI token balance held by a wallet for a given SPL mint.
 *
 * Dev-mode fallback: when `mintAddress` is unset or 'TBA' (the $pixclof mint
 * is not deployed yet), returns Number.MAX_SAFE_INTEGER so every wallet is
 * treated as having access.
 *
 * @param {string} walletAddress - Owner wallet (base58).
 * @param {string} mintAddress   - SPL token mint (base58), or 'TBA'/falsy.
 * @returns {Promise<number>} UI amount (decimal-adjusted), 0 if none / on error.
 */
export async function getTokenBalance(walletAddress, mintAddress) {
  if (!mintAddress || mintAddress === 'TBA') {
    console.warn('PIXCLOF_MINT not set, granting access (dev mode)');
    return Number.MAX_SAFE_INTEGER;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: mintAddress },
          { encoding: 'jsonParsed' },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`Helius RPC returned HTTP ${res.status}`);
      return 0;
    }

    const json = await res.json();
    if (json.error) {
      console.error('Helius RPC error:', json.error);
      return 0;
    }

    // Sum uiAmount across all matching token accounts. A wallet usually has a
    // single token account per mint, but summing is safer if there are more.
    const accounts = json?.result?.value ?? [];
    let total = 0;
    for (const account of accounts) {
      const uiAmount = account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof uiAmount === 'number') total += uiAmount;
    }
    return total;
  } catch (err) {
    console.error('getTokenBalance failed:', err?.message || err);
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}
