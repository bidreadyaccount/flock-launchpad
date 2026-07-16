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
        const c = connectors[0]
        if (c) connect({ connector: c })
        else alert('No wallet found. Install MetaMask or another browser wallet.')
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
          <span className="wordmark-egg">🥚</span> FLOCK
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
