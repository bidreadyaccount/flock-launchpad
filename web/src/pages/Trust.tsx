import { LAUNCHPAD_ADDRESS, TREASURY_ADDRESS, EXPLORER } from '../config'

const DEAD = '0x000000000000000000000000000000000000dEaD'

function Claim({ title, children, proof, proofLabel }: {
  title: string; children: React.ReactNode; proof?: string; proofLabel?: string
}) {
  return (
    <div className="trust-claim">
      <h3>{title}</h3>
      <p>{children}</p>
      {proof && <a className="mono proof" href={proof} target="_blank" rel="noreferrer">{proofLabel ?? 'verify on-chain ↗'}</a>}
    </div>
  )
}

export default function Trust() {
  return (
    <div className="trust-page">
      <h1>Don't trust us. Check.</h1>
      <p className="form-sub">
        Every claim below links to public blockchain proof. You never have to take our word for anything.
      </p>

      <Claim
        title="Nobody can rug the pot — including us"
        proof={`${EXPLORER}/address/${LAUNCHPAD_ADDRESS}?tab=contract`}
        proofLabel="read the verified contract code ↗"
      >
        The launchpad contract has no owner, no admin functions, no pause button and no upgrade
        path. The ETH people pay into a coin's bonding curve can only go two places: back to
        sellers, or into that coin's Uniswap pool at graduation. There is no withdraw function.
        The source code is verified on Blockscout — anyone can read it.
      </Claim>

      <Claim
        title="Liquidity is locked forever"
        proof={`${EXPLORER}/address/${DEAD}`}
        proofLabel="see the burn address holdings ↗"
      >
        When a coin graduates, its pot and reserved tokens go into Uniswap and the LP tokens
        are sent to the burn address — an address nobody has the keys to. The liquidity can
        never be pulled. This happens automatically in code, not by a human promise.
      </Claim>

      <Claim title="Every coin launches fair">
        Fixed 1,000,000,000 supply, minted at creation. No presale, no team allocation, no
        hidden mint function. Creators who want their own coin buy it on the same curve as
        everyone else. All 6 launchpad fees and parameters are hard-coded and public.
      </Claim>

      <Claim
        title="Our earnings are public"
        proof={`${EXPLORER}/address/${TREASURY_ADDRESS}`}
        proofLabel="watch the treasury wallet ↗"
      >
        Of the 1% trade fee, the platform keeps just 0.3%. The coin's creator earns 0.5%,
        and 0.2% is automatically burned (below). Nothing is skimmed from the liquidity pot
        at graduation. Every fee we have ever collected is visible in the treasury wallet, forever.
      </Claim>

      <Claim
        title="Every trade burns supply"
        proof={`${EXPLORER}/address/${DEAD}`}
        proofLabel="see burned tokens at the dead address ↗"
      >
        A fifth of every trade fee — taken from the platform's share, not the creator's —
        instantly buys the coin back on its own curve and sends the tokens to the burn
        address. Buys and sells alike make the coin scarcer. The burns show up in each
        coin's activity feed marked 🔥, and each one is a public transaction.
      </Claim>

      <Claim title="Every coin gets a sniper check">
        Sniper crews spread buys across dozens of fresh wallets to grab most of a coin's
        supply in its first minutes, then dump on everyone else. Each coin page here runs a
        Nest Check: it reads the public holder list and flags coins where a few wallets —
        especially brand-new ones with no history — control the tradable supply. The check
        uses only public explorer data, runs in your own browser, and can't be faked by us
        or by coin creators.
      </Claim>

      <div className="trust-claim trust-risk">
        <h3>The honest part</h3>
        <p>
          Memecoins are gambling, not investing. Most go to zero. A locked pool and fair
          launch protect you from rugs — they do not protect you from a coin simply dying.
          The smart contract is tested but young; bugs are always possible. Only play with
          money you can afford to lose completely.
        </p>
      </div>
    </div>
  )
}
