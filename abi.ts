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

export function parseMeta(uri: string): TokenMeta {
  try {
    const j = JSON.parse(uri)
    if (typeof j === 'object' && j) return j
  } catch { /* not JSON — treat as image url */ }
  if (uri.startsWith('http')) return { image: uri }
  return {}
}
