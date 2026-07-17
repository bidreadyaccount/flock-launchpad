import launchpadAbiJson from './launchpad-abi.json'

export const launchpadAbi = launchpadAbiJson as any

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

// ---------- formatting helpers ----------

export function fmtEth(wei: bigint, dp = 4): string {
  const s = Number(wei) / 1e18
  if (s === 0) return '0'
  if (s < 0.0001) return s.toExponential(2)
  return s.toLocaleString('en-US', { maximumFractionDigits: dp })
}

export function fmtTokens(wei: bigint): string {
  const n = Number(wei) / 1e18
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(2)
}

export function shortAddr(a: string): string {
  return a.slice(0, 6) + '…' + a.slice(-4)
}

/** Current spot price in ETH per token from virtual reserves */
export function spotPrice(virtualEth: bigint, virtualToken: bigint): number {
  if (virtualToken === 0n) return 0
  return Number(virtualEth) / Number(virtualToken)
}

/** Market cap in ETH = spot price * 1B total supply */
export function marketCapEth(virtualEth: bigint, virtualToken: bigint): number {
  return spotPrice(virtualEth, virtualToken) * 1e9
}

export type TokenMeta = { description?: string; image?: string }

/**
 * Parse on-chain coin metadata DEFENSIVELY. The metadataURI is arbitrary
 * user input, so we accept ONLY string fields (and cap their length) and
 * ignore anything else — an attacker cannot smuggle an object/array through
 * here and crash the renderer (M-04). Everything downstream can assume
 * `description` and `image`, if present, are plain bounded strings.
 */
export function parseMeta(uri: unknown): TokenMeta {
  if (typeof uri !== 'string') return {}
  // M-02: reject oversized blobs BEFORE JSON.parse so a hostile coin can't burn
  // the visitor's CPU/memory. The contract now caps metadata at 4 KiB on-chain;
  // this guards older/other tokens and keeps parsing cheap regardless.
  if (uri.length > 8192) return {}
  try {
    const j = JSON.parse(uri)
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const out: TokenMeta = {}
      if (typeof (j as any).description === 'string') out.description = (j as any).description.slice(0, 500)
      if (typeof (j as any).image === 'string') out.image = (j as any).image.slice(0, 2048)
      return out
    }
  } catch { /* not JSON — fall through and treat a bare URL as an image */ }
  if (uri.startsWith('http')) return { image: uri.slice(0, 2048) }
  return {}
}

/** A transaction deadline `n` seconds from now, as a uint256 for the contract. */
export function deadline(seconds = 600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds)
}
