import { useQuery } from '@tanstack/react-query'
import { EXPLORER, LAUNCHPAD_ADDRESS, DEMO_MODE } from './config'

/**
 * NEST CHECK — sniper & concentration screening, using only public
 * explorer data (Blockscout API). Runs entirely in the visitor's browser;
 * nothing to trust, everything re-checkable by hand.
 *
 * What it looks for (the "$ARROW pattern"):
 *  - a few wallets holding most of the tradable supply
 *  - top holders that are brand-new wallets with no history — the
 *    signature of one operator spreading buys across fresh addresses
 */

const API = `${EXPLORER}/api/v2`
const DEAD = '0x000000000000000000000000000000000000dead'

export type HolderRow = {
  address: string
  isContract: boolean
  label?: string
  tokens: bigint
  pctOfCirculating: number // 0..100
  fresh: boolean | null // null = unknown (lookup failed)
  txCount: number | null
}

export type NestCheck = {
  status: 'ok' | 'too-new' | 'unavailable'
  verdict?: 'too-early' | 'healthy' | 'caution' | 'high-risk'
  realWallets?: number // real (non-infrastructure) holder wallets seen
  holdersCount?: number
  circulating?: bigint
  top10Pct?: number // % of circulating held by top 10 wallets
  freshCount?: number // fresh wallets among top 10
  freshPct?: number // % of circulating held by those fresh wallets
  rows?: HolderRow[]
}

async function getJson(url: string) {
  const r = await fetch(url)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`explorer api ${r.status}`)
  return r.json()
}

async function fetchNestCheck(token: string): Promise<NestCheck> {
  if (DEMO_MODE) {
    return {
      status: 'ok', verdict: 'caution', holdersCount: 143, top10Pct: 41.2,
      freshCount: 3, freshPct: 12.4, circulating: 0n, rows: [],
    }
  }
  const [info, holders] = await Promise.all([
    getJson(`${API}/tokens/${token}`),
    getJson(`${API}/tokens/${token}/holders`),
  ])
  if (!info || !holders?.items) return { status: 'too-new' }

  const totalSupply = BigInt(info.total_supply ?? '0')
  if (totalSupply === 0n) return { status: 'too-new' }

  const launchpad = LAUNCHPAD_ADDRESS.toLowerCase()
  type RawHolder = { address: { hash: string; is_contract?: boolean; name?: string }; value: string }
  const items: RawHolder[] = holders.items

  // Split infrastructure (launchpad, burn address, pools/contracts) from wallets
  let infraHeld = 0n
  const wallets: { address: string; isContract: boolean; label?: string; tokens: bigint }[] = []
  for (const h of items) {
    const addr = (h.address?.hash ?? '').toLowerCase()
    const tokens = BigInt(h.value ?? '0')
    const isInfra = addr === launchpad || addr === DEAD || addr === '0x0000000000000000000000000000000000000000' || h.address?.is_contract
    if (isInfra) infraHeld += tokens
    else wallets.push({ address: h.address.hash, isContract: false, label: h.address?.name, tokens })
  }
  const circulating = totalSupply - infraHeld
  if (circulating <= 0n || wallets.length === 0) return { status: 'too-new' }

  const top = wallets.slice(0, 10)

  // Fresh-wallet screening: wallets with almost no history that appear in
  // the top 10 are the classic multi-wallet sniper signature.
  const counters = await Promise.all(
    top.map(async (w) => {
      try {
        const c = await getJson(`${API}/addresses/${w.address}/counters`)
        return c ? Number(c.transactions_count ?? NaN) : NaN
      } catch { return NaN }
    })
  )

  const pct = (n: bigint) => Number((n * 10000n) / circulating) / 100
  const rows: HolderRow[] = top.map((w, i) => ({
    address: w.address,
    isContract: w.isContract,
    label: w.label,
    tokens: w.tokens,
    pctOfCirculating: pct(w.tokens),
    txCount: Number.isNaN(counters[i]) ? null : counters[i],
    fresh: Number.isNaN(counters[i]) ? null : counters[i] <= 2,
  }))

  const top10Held = top.reduce((s, w) => s + w.tokens, 0n)
  const freshRows = rows.filter((r) => r.fresh === true)
  const freshHeld = freshRows.reduce((s, r) => s + r.tokens, 0n)

  const top10Pct = pct(top10Held)
  const freshPct = pct(freshHeld)
  const freshCount = freshRows.length
  const realWallets = wallets.length

  const base = {
    status: 'ok' as const,
    holdersCount: Number(info.holders_count ?? info.holders ?? 0),
    circulating, top10Pct, freshCount, freshPct, realWallets, rows,
  }

  // Not enough real holders to judge yet. A brand-new coin is naturally held
  // almost entirely by its creator — that's normal, not a sniper attack, so
  // we don't cry wolf. Sniping is a CROWD of coordinated fresh wallets, which
  // can't exist until there's a crowd of holders at all.
  const MIN_HOLDERS = 8
  if (realWallets < MIN_HOLDERS) return { ...base, verdict: 'too-early' }

  let verdict: NestCheck['verdict'] = 'healthy'

  // Signal 1 — the sniper pattern: MULTIPLE fresh, no-history wallets holding
  // meaningful supply together (the "$ARROW" 200-wallet pattern in miniature).
  // A single fresh wallet is almost always just the creator, so it never flags.
  if (freshCount >= 3) verdict = 'caution'
  if (freshCount >= 5 && freshPct > 30) verdict = 'high-risk'

  // Signal 2 — extreme whale concentration among a real holder base.
  if (top10Pct > 60 && verdict === 'healthy') verdict = 'caution'
  if (top10Pct > 85 && freshCount >= 3) verdict = 'high-risk'

  return { ...base, verdict }
}

export function useNestCheck(token: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ['nestcheck', token],
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<NestCheck> => {
      try { return await fetchNestCheck(token!) }
      catch { return { status: 'unavailable' } }
    },
  })
}
