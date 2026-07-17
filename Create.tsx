import { useEffect, useState } from 'react'
import { useAccount, useWriteContract, useSignMessage } from 'wagmi'
import { parseEther, decodeEventLog } from 'viem'
import { LAUNCHPAD_ADDRESS, robinhoodChain } from '../config'
import { launchpadAbi } from '../abi'
import { publicClient } from '../hooks'

// One-time-per-wallet eligibility acknowledgement. Kept generic on purpose:
// sanctions/restriction lists change over time, so we don't enumerate countries
// on-site — the user attests they're allowed where they are.
const TERMS =
  "I confirm that minting and trading tokens is permitted in my jurisdiction, that I'm not a resident of a sanctioned or restricted region, and that I take full responsibility for complying with my local laws. If it's restricted where I am, I won't mint."
const TERMS_KEY = (addr: string) => `flock_terms_v1_${addr.toLowerCase()}`

export default function Create() {
  const { address, isConnected, chainId } = useAccount()
  const wrongChain = isConnected && chainId !== robinhoodChain.id
  const { writeContractAsync } = useWriteContract()
  const { signMessageAsync } = useSignMessage()

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [desc, setDesc] = useState('')
  const [image, setImage] = useState('')
  const [firstBuy, setFirstBuy] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  // Terms state — checked once per wallet, remembered locally so we never nag again.
  const [accepted, setAccepted] = useState(false)
  const [agree, setAgree] = useState(false)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    try {
      setAccepted(!!address && !!localStorage.getItem(TERMS_KEY(address)))
    } catch {
      setAccepted(false)
    }
    setAgree(false)
  }, [address])

  async function acceptTerms() {
    if (!address || !agree) return
    setErrMsg('')
    setSigning(true)
    try {
      const sig = await signMessageAsync({
        message: `FLOCK — one-time eligibility confirmation\n\n${TERMS}\n\nWallet: ${address}`,
      })
      try { localStorage.setItem(TERMS_KEY(address), sig) } catch { /* private mode: still allow this session */ }
      setAccepted(true)
    } catch (e: any) {
      setErrMsg(e?.shortMessage || 'You need to sign the confirmation to hatch a coin.')
    }
    setSigning(false)
  }

  async function submit() {
    setErrMsg('')
    const nm = name.trim(), sym = symbol.trim().toUpperCase()
    if (!nm || !sym) { setErrMsg('Name and ticker are required.'); return }
    // The contract limits name/ticker by UTF-8 BYTES (≤64 / ≤16), not
    // characters — an emoji is several bytes but the form's maxLength counts it
    // as one or two, so validate the real byte length and error rather than
    // letting the transaction revert on-chain as "bad name"/"bad symbol".
    if (new TextEncoder().encode(nm).length > 64) { setErrMsg('Name is too long (max 64 bytes — emoji count for more).'); return }
    if (new TextEncoder().encode(sym).length > 16) { setErrMsg('Ticker is too long (max 16 bytes — emoji count for more).'); return }
    if (wrongChain) { setErrMsg('Switch your wallet to Robinhood Chain first.'); return }
    if (!accepted) { setErrMsg('Please confirm eligibility first.'); return }
    try {
      const meta = JSON.stringify({ description: desc.trim(), image: image.trim() })
      // The contract caps metadata at 4096 BYTES (not chars) — validate the
      // real UTF-8 length and error rather than silently slicing mid-character.
      if (new TextEncoder().encode(meta).length > 4096) {
        setErrMsg('Description or image URL is too long — please shorten it.')
        return
      }
      setStatus('pending')
      const hash = await writeContractAsync({
        address: LAUNCHPAD_ADDRESS,
        abi: launchpadAbi,
        chainId: robinhoodChain.id,
        functionName: 'createToken',
        args: [nm, sym, meta],
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

      {!isConnected ? (
        <p className="err">Connect your wallet first (top right).</p>
      ) : wrongChain ? (
        <button className="btn btn-accent btn-big" disabled>Switch to Robinhood Chain</button>
      ) : !accepted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, opacity: 0.85, cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{TERMS}</span>
          </label>
          <button className="btn btn-accent btn-big" disabled={!agree || signing} onClick={acceptTerms}>
            {signing ? 'Waiting for signature…' : 'Sign to confirm (one time, no gas)'}
          </button>
        </div>
      ) : (
        <button className="btn btn-accent btn-big" disabled={status === 'pending'} onClick={submit}>
          {status === 'pending' ? 'Hatching…' : 'Hatch it'}
        </button>
      )}
    </div>
  )
}
