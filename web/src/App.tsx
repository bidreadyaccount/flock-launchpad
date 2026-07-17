import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { robinhoodChain } from './config'
import { shortAddr } from './abi'
import Home from './pages/Home'
import Create from './pages/Create'
import Token from './pages/Token'
import Trust from './pages/Trust'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const fn = () => setHash(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

function ConnectButton() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  if (isConnected && chainId !== robinhoodChain.id) {
    return (
      <button className="btn btn-warn" onClick={() => switchChain({ chainId: robinhoodChain.id })}>
        Switch to Robinhood Chain
      </button>
    )
  }
  if (isConnected && address) {
    return (
      <button className="btn btn-ghost mono" onClick={() => disconnect()} title="Disconnect">
        {shortAddr(address)}
      </button>
    )
  }
  return (
    <button
      className="btn btn-primary"
      disabled={isPending}
      onClick={() => {
        // Desktop / in-app wallet browser: use the injected wallet. Everywhere
        // else (a normal mobile browser has no extension): open WalletConnect,
        // which deep-links into Uniswap Wallet / MetaMask / Rainbow / etc.
        const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum
        const injectedC = connectors.find((c) => c.type === 'injected')
        const wcC = connectors.find((c) => c.type === 'walletConnect')
        const c = hasInjected && injectedC ? injectedC : (wcC ?? connectors[0])
        if (c) connect({ connector: c })
        else alert('No wallet available.')
      }}
    >
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </button>
  )
}

export default function App() {
  const hash = useHashRoute()

  let page = <Home />
  if (hash === '#/create') page = <Create />
  else if (hash === '#/trust') page = <Trust />
  else if (hash.startsWith('#/coin/')) page = <Token token={hash.slice(7) as `0x${string}`} />

  return (
    <div className="shell">
      <header className="header">
        <a href="#/" className="wordmark">
          <svg className="wordmark-egg" style={{ height: '1.05em', width: 'auto', verticalAlign: '-0.16em' }} viewBox="0 0 64 80" role="img" aria-label="egg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="flock-egg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FDF3E0" />
                <stop offset="1" stopColor="#F3C877" />
              </linearGradient>
            </defs>
            <path d="M32 5C19 5 9 26 9 47c0 17 10 28 23 28s23-11 23-28C55 26 45 5 32 5Z" fill="url(#flock-egg)" stroke="#E3A64B" strokeWidth="2.5" />
            <ellipse cx="24" cy="30" rx="5.5" ry="9" fill="#FFFFFF" opacity="0.5" />
          </svg> FLOCK
        </a>
        <nav className="nav">
          <a href="#/trust" className="nav-link">Trust</a>
          <a href="#/create" className="btn btn-accent">+ Hatch a coin</a>
          <ConnectButton />
        </nav>
      </header>
      <main>{page}</main>
      <footer className="footer">
        <p>
          FLOCK runs on Robinhood Chain. Coins launched here are memecoins with no intrinsic value —
          you can lose everything you put in. Nothing here is investment advice.
          {' '}<a href="#/trust">Verify everything yourself →</a>
        </p>
      </footer>
    </div>
  )
}
