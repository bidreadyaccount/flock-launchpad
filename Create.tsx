import { useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { parseEther, decodeEventLog } from 'viem'
import { LAUNCHPAD_ADDRESS } from '../config'
import { launchpadAbi } from '../abi'
import { publicClient } from '../hooks'

export default function Create() {
  const { isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [desc, setDesc] = useState('')
  const [image, setImage] = useState('')
  const [firstBuy, setFirstBuy] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function submit() {
    setErrMsg('')
    if (!name.trim() || !symbol.trim()) { setErrMsg('Name and ticker are required.'); return }
    try {
      setStatus('pending')
      const meta = JSON.stringify({ description: desc.trim(), image: image.trim() })
      const hash = await writeContractAsync({
        address: LAUNCHPAD_ADDRESS,
        abi: launchpadAbi,
        functionName: 'createToken',
        args: [name.trim(), symbol.trim().toUpperCase(), meta],
        value: firstBuy ? parseEther(firstBuy) : 0n,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      // find the new token address in the logs
      let tokenAddr: string | undefined
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: launchpadAbi, data: log.data, topics: log.topics }) as { eventName: string; args: any }
          if (ev.eventName === 'TokenCreated') {
            tokenAddr = ev.args.token
            break
          }
        } catch { /* other contract's log */ }
      }
      window.location.hash = tokenAddr ? `#/coin/${tokenAddr}` : '#/'
    } catch (e: any) {
      setStatus('error')
      setErrMsg(e?.shortMessage || e?.message || 'Transaction failed')
    }
  }

  return (
    <div className="form-page">
      <h1>Hatch a coin</h1>
      <p className="form-sub">
        1,000,000,000 supply, minted at launch. 800M sold on the bonding curve, 200M reserved for
        Uniswap liquidity at graduation. You get no free allocation — if you want in, buy like everyone
        else (there's a first-buy box below so nobody snipes your launch). But you do earn:
        <strong> 0.5% of every trade on your coin goes to you</strong>, claimable any time.
      </p>

      <label>Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Robin Coin" />
      </label>
      <label>Ticker
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={16} placeholder="ROBIN" />
      </label>
      <label>Description <span className="opt">optional</span>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={280} rows={3} placeholder="What's the joke?" />
      </label>
      <label>Image URL <span className="opt">optional</span>
        <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… (host on imgur, IPFS, etc.)" />
      </label>
      <label>Your first buy in ETH <span className="opt">optional, anti-snipe</span>
        <input value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} inputMode="decimal" placeholder="0.05" />
      </label>

      {errMsg && <p className="err">{errMsg}</p>}

      {isConnected ? (
        <button className="btn btn-accent btn-big" disabled={status === 'pending'} onClick={submit}>
          {status === 'pending' ? 'Hatching…' : 'Hatch it'}
        </button>
      ) : (
        <p className="err">Connect your wallet first (top right).</p>
      )}
    </div>
  )
}
