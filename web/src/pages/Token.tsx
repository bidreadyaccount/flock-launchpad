import { useMemo, useState } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { parseEther, parseUnits } from 'viem'
import { useCoin, useTrades, publicClient, type TradePoint } from '../hooks'
import { LAUNCHPAD_ADDRESS, EXPLORER, uniswapUrl } from '../config'
import { launchpadAbi, erc20Abi, fmtEth, fmtTokens, shortAddr, marketCapEth } from '../abi'
import { useNestCheck } from '../holders'
import { CoinImage } from '../CoinImage'

// ---------- tiny SVG price chart, no chart library needed ----------
function Chart({ trades }: { trades: TradePoint[] }) {
  const pts = trades.map((t) => t.price)
  if (pts.length < 2) return <div className="chart chart-empty">Price chart appears after a few trades</div>
  const w = 640, h = 220, pad = 8
  const min = Math.min(...pts), max = Math.max(...pts)
  const range = max - min || max || 1
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - 2 * pad)
  const y = (p: number) => h - pad - ((p - min) / range) * (h - 2 * pad)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="price chart">
      <path d={`${d} L${x(pts.length - 1)},${h} L${x(0)},${h} Z`} fill={up ? 'rgba(83,211,196,.12)' : 'rgba(244,83,110,.12)'} />
      <path d={d} fill="none" stroke={up ? '#53D3C4' : '#F4536E'} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

function TradePanel({ token, complete }: { token: `0x${string}`; complete: boolean }) {
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const parsed = useMemo(() => {
    try { return amount ? (side === 'buy' ? parseEther(amount) : parseUnits(amount, 18)) : 0n }
    catch { return 0n }
  }, [amount, side])

  const { data: quote } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: launchpadAbi,
    functionName: side === 'buy' ? 'quoteBuy' : 'quoteSell',
    args: [token, parsed],
    query: { enabled: parsed > 0n && !complete, refetchInterval: 5000 },
  })

  const { data: tokenBal } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address, refetchInterval: 8000 },
  })

  async function go() {
    if (!isConnected || parsed === 0n || quote === undefined) return
    setBusy(true); setMsg('')
    try {
      const minOut = ((quote as bigint) * 98n) / 100n // 2% slippage guard
      if (side === 'buy') {
        const hash = await writeContractAsync({
          address: LAUNCHPAD_ADDRESS, abi: launchpadAbi,
          functionName: 'buy', args: [token, minOut], value: parsed,
        })
        await publicClient.waitForTransactionReceipt({ hash })
      } else {
        // approve if needed, then sell
        const allowance = (await publicClient.readContract({
          address: token, abi: erc20Abi, functionName: 'allowance',
          args: [address!, LAUNCHPAD_ADDRESS],
        })) as bigint
        if (allowance < parsed) {
          const h1 = await writeContractAsync({
            address: token, abi: erc20Abi, functionName: 'approve',
            args: [LAUNCHPAD_ADDRESS, parsed],
          })
          await publicClient.waitForTransactionReceipt({ hash: h1 })
        }
        const hash = await writeContractAsync({
          address: LAUNCHPAD_ADDRESS, abi: launchpadAbi,
          functionName: 'sell', args: [token, parsed, minOut],
        })
        await publicClient.waitForTransactionReceipt({ hash })
      }
      setAmount(''); setMsg('Done ✓')
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Transaction failed')
    } finally {
      setBusy(false)
    }
  }

  if (complete) {
    return (
      <div className="trade-panel">
        <p>This coin has fledged. Trade it on Uniswap:</p>
        <a className="btn btn-primary btn-big" href={uniswapUrl(token)} target="_blank" rel="noreferrer">Open Uniswap ↗</a>
      </div>
    )
  }

  return (
    <div className="trade-panel">
      <div className="side-toggle">
        <button className={side === 'buy' ? 'on buy' : ''} onClick={() => { setSide('buy'); setAmount('') }}>Buy</button>
        <button className={side === 'sell' ? 'on sell' : ''} onClick={() => { setSide('sell'); setAmount('') }}>Sell</button>
      </div>
      <label>
        {side === 'buy' ? 'Spend (ETH)' : 'Sell (tokens)'}
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" />
      </label>
      {side === 'sell' && tokenBal !== undefined && (
        <button className="link-btn mono" onClick={() => setAmount((Number(tokenBal as bigint) / 1e18).toString())}>
          balance: {fmtTokens(tokenBal as bigint)} (tap to use)
        </button>
      )}
      {parsed > 0n && quote !== undefined && (
        <p className="quote mono">
          ≈ {side === 'buy' ? `${fmtTokens(quote as bigint)} tokens` : `${fmtEth(quote as bigint)} ETH`} <span className="opt">(1% fee incl., 2% slippage max)</span>
        </p>
      )}
      {msg && <p className={msg === 'Done ✓' ? 'ok' : 'err'}>{msg}</p>}
      <button className={`btn btn-big ${side === 'buy' ? 'btn-primary' : 'btn-sellside'}`} disabled={!isConnected || busy || parsed === 0n} onClick={go}>
        {busy ? 'Confirm in wallet…' : !isConnected ? 'Connect wallet to trade' : side === 'buy' ? 'Buy' : 'Sell'}
      </button>
    </div>
  )
}

// ---------- Nest Check: sniper & whale screening from public explorer data ----------
function NestCheck({ token }: { token: `0x${string}` }) {
  const { data: nc, isLoading } = useNestCheck(token)
  const [open, setOpen] = useState(false)

  if (isLoading) return <div className="nestcheck"><h3>🪺 Nest Check</h3><p className="opt">Screening holders…</p></div>
  if (!nc || nc.status === 'unavailable') return null
  if (nc.status === 'too-new') {
    return (
      <div className="nestcheck">
        <h3>🪺 Nest Check</h3>
        <p className="opt">Too new to screen — the explorer hasn't indexed holders yet. Check back in a few minutes.</p>
      </div>
    )
  }

  // Too new to judge — held mostly by its creator, like every fresh coin.
  if (nc.verdict === 'too-early') {
    return (
      <div className="nestcheck">
        <div className="nc-head"><h3>🪺 Nest Check</h3><span className="nc-badge nc-badge-neutral">Too new to judge</span></div>
        <p className="nc-blurb">
          Only {nc.realWallets} wallet{nc.realWallets === 1 ? '' : 's'} hold{nc.realWallets === 1 ? 's' : ''} this coin so far — normal for a fresh
          launch, where the creator holds most of it until others buy in. Sniper screening kicks in
          once a real crowd of holders shows up.
        </p>
      </div>
    )
  }

  const V = {
    'healthy':   { cls: 'nc-good', label: 'Looks healthy', blurb: 'Supply is reasonably spread out among wallets with real history.' },
    'caution':   { cls: 'nc-warn', label: 'Caution',       blurb: 'Ownership is somewhat concentrated, or several top holders are brand-new wallets. Look at the list below before buying.' },
    'high-risk': { cls: 'nc-bad',  label: 'High risk',     blurb: 'Several no-history wallets control most of the tradable supply together — the classic multi-wallet sniper pattern. They can dump on you at any time.' },
  }[nc.verdict!]

  return (
    <div className={`nestcheck ${V.cls}`}>
      <div className="nc-head">
        <h3>🪺 Nest Check</h3>
        <span className="nc-badge">{V.label}</span>
      </div>
      <p className="nc-blurb">{V.blurb}</p>
      <div className="nc-stats mono">
        <div><span className="stat-label">holders</span>{nc.holdersCount}</div>
        <div><span className="stat-label">top 10 wallets hold</span>{nc.top10Pct!.toFixed(1)}%</div>
        <div><span className="stat-label">fresh-wallet share</span>{nc.freshPct!.toFixed(1)}% ({nc.freshCount} wallets)</div>
      </div>
      <div className="nc-bar" role="img" aria-label={`top 10 wallets hold ${nc.top10Pct!.toFixed(1)} percent`}>
        <div className="nc-bar-fill" style={{ width: `${Math.min(100, nc.top10Pct!)}%` }} />
      </div>
      <button className="link-btn mono" onClick={() => setOpen(!open)}>
        {open ? 'hide' : 'show'} top 10 wallets {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="nc-list mono">
          {nc.rows!.map((r) => (
            <a key={r.address} href={`${EXPLORER}/address/${r.address}`} target="_blank" rel="noreferrer" className="nc-row">
              <span>{shortAddr(r.address)}</span>
              <span>{r.pctOfCirculating.toFixed(2)}%</span>
              <span>{r.fresh === true ? '⚠ fresh wallet' : r.fresh === false ? `${r.txCount} txs` : '—'}</span>
            </a>
          ))}
          <p className="opt nc-foot">
            % of tradable supply (excludes the launchpad curve, burned tokens and liquidity pools).
            "Fresh" = a wallet with ≤2 prior transactions. Data: public Blockscout API — verify it yourself.
          </p>
        </div>
      )}
    </div>
  )
}

function CreatorEarnings({ creator }: { creator: `0x${string}` }) {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const { data: owed, refetch } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: launchpadAbi,
    functionName: 'creatorFees',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address, refetchInterval: 10000 },
  })
  if (!address || address.toLowerCase() !== creator.toLowerCase()) return null
  if (!owed || (owed as bigint) === 0n) return null
  return (
    <div className="creator-banner">
      <span>You created this coin — <strong className="mono">{fmtEth(owed as bigint)} ETH</strong> in trade fees is yours to claim.</span>
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true)
        try {
          const hash = await writeContractAsync({
            address: LAUNCHPAD_ADDRESS, abi: launchpadAbi, functionName: 'claimCreatorFees',
          })
          await publicClient.waitForTransactionReceipt({ hash })
          refetch()
        } catch { /* user rejected or failed — banner stays */ }
        setBusy(false)
      }}>{busy ? 'Claiming…' : 'Claim'}</button>
    </div>
  )
}

export default function Token({ token }: { token: `0x${string}` }) {
  const { coin, isLoading } = useCoin(token)
  const { data: trades } = useTrades(token)

  if (isLoading) return <div className="empty"><p>Reading the chain…</p></div>
  if (!coin) return <div className="empty"><p>Coin not found. <a href="#/">Back to the nest</a></p></div>

  const mcap = marketCapEth(coin.virtualEth, coin.virtualToken)
  const pct = Math.min(100, coin.progressBps / 100)
  const DEAD = '0x000000000000000000000000000000000000dead'
  const burned = (trades ?? []).filter(t => t.trader.toLowerCase() === DEAD)
    .reduce((s, t) => s + t.tokenAmount, 0n)

  return (
    <div className="token-page">
      <div className="token-head">
        <div className="card-img small">
          <CoinImage src={coin.meta.image} alt={coin.name} small />
        </div>
        <div>
          <h1>{coin.name} <span className="ticker">${coin.symbol}</span></h1>
          {coin.meta.description && <p className="card-desc">{coin.meta.description}</p>}
          <p className="mono meta-line">
            by {shortAddr(coin.creator)} · <a href={`${EXPLORER}/address/${coin.token}`} target="_blank" rel="noreferrer">contract ↗</a>
          </p>
        </div>
      </div>

      <CreatorEarnings creator={coin.creator} />

      <div className="stat-row mono">
        <div><span className="stat-label">market cap</span>{mcap.toFixed(3)} ETH</div>
        <div><span className="stat-label">pot (goes to LP)</span>{fmtEth(coin.realEth, 3)} ETH</div>
        <div><span className="stat-label">hatched</span>{coin.graduated ? 'fledged 🐦' : `${pct.toFixed(1)}%`}</div>
        <div><span className="stat-label">🔥 burned</span>{fmtTokens(burned)}</div>
      </div>

      <div className="token-cols">
        <div>
          <Chart trades={trades ?? []} />
          <h3>Activity</h3>
          <div className="feed">
            {(trades ?? []).slice(-30).reverse().map((t, i) => (
              <a key={i} href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noreferrer"
                 className={`feed-row mono ${t.trader.toLowerCase() === DEAD ? 'burnrow' : t.isBuy ? 'buyrow' : 'sellrow'}`}>
                <span>{t.trader.toLowerCase() === DEAD ? '🔥 burn' : t.isBuy ? '▲ buy' : '▼ sell'}</span>
                <span>{fmtEth(t.ethAmount)} ETH</span>
                <span>{fmtTokens(t.tokenAmount)}</span>
                <span>{t.trader.toLowerCase() === DEAD ? 'auto-buyback' : shortAddr(t.trader)}</span>
              </a>
            ))}
            {(trades ?? []).length === 0 && <p className="opt">No trades yet.</p>}
          </div>
        </div>
        <div>
          <NestCheck token={token} />
          <TradePanel token={token} complete={coin.complete} />
        </div>
      </div>
    </div>
  )
}
