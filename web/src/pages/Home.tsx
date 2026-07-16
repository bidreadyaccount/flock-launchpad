import { useCoins, type CoinInfo } from '../hooks'
import { fmtEth, marketCapEth } from '../abi'
import { LAUNCHPAD_ADDRESS, DEMO_MODE } from '../config'

function HatchBar({ bps, graduated }: { bps: number; graduated: boolean }) {
  if (graduated) return <div className="hatchbar fledged"><span>🐦 fledged → trading on Uniswap</span></div>
  const pct = Math.min(100, bps / 100)
  return (
    <div className="hatchbar" title={`${pct.toFixed(1)}% hatched`}>
      <div className="hatchbar-fill" style={{ width: `${pct}%` }} />
      <span>{pct.toFixed(0)}% hatched</span>
    </div>
  )
}

function CoinCard({ c, king }: { c: CoinInfo; king?: boolean }) {
  const mcap = marketCapEth(c.virtualEth, c.virtualToken)
  return (
    <a href={`#/coin/${c.token}`} className={`card ${king ? 'card-king' : ''}`}>
      <div className="card-img">
        {c.meta.image
          ? <img src={c.meta.image} alt={c.name} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          : <span className="card-egg">🥚</span>}
      </div>
      <div className="card-body">
        {king && <div className="king-label">👑 king of the nest</div>}
        <h3>{c.name} <span className="ticker">${c.symbol}</span></h3>
        {c.meta.description && <p className="card-desc">{c.meta.description}</p>}
        <div className="card-stats mono">
          <span>mcap {mcap.toFixed(3)} ETH</span>
          <span>pot {fmtEth(c.realEth, 3)} ETH</span>
        </div>
        <HatchBar bps={c.progressBps} graduated={c.graduated} />
      </div>
    </a>
  )
}

export default function Home() {
  const { data: coins, isLoading, error } = useCoins()

  if (!DEMO_MODE && LAUNCHPAD_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return (
      <div className="empty">
        <h2>Almost live</h2>
        <p>Deploy the FlockLaunchpad contract, then paste its address into <code>src/config.ts</code>. The README walks you through it.</p>
      </div>
    )
  }
  if (isLoading) return <div className="empty"><p>Reading the chain…</p></div>
  if (error) return <div className="empty"><p>Couldn't reach Robinhood Chain RPC. Refresh, or set an Alchemy endpoint in config.ts.</p></div>
  if (!coins || coins.length === 0) {
    return (
      <div className="empty">
        <h2>The nest is empty</h2>
        <p>No coins yet. Be the first to hatch one.</p>
        <a href="#/create" className="btn btn-accent">+ Hatch a coin</a>
      </div>
    )
  }

  // King of the nest = live coin closest to fledging
  const live = coins.filter((c) => !c.graduated)
  const king = live.length ? live.reduce((a, b) => (b.progressBps > a.progressBps ? b : a)) : undefined
  const rest = coins.filter((c) => c !== king)

  return (
    <>
      <div className="hero">
        <h1><em>Hatch</em> a coin.<br />Watch it <em>fledge</em>.</h1>
        <p className="hero-sub">
          Fair-launch memecoins on Robinhood Chain. Every coin starts on a bonding curve —
          sell out the curve and its liquidity flies to Uniswap, locked forever. No presale, no team allocation.
        </p>
      </div>
      {king && <CoinCard c={king} king />}
      <div className="grid">
        {rest.map((c) => <CoinCard key={c.token} c={c} />)}
      </div>
    </>
  )
}
