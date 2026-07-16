# FLOCK 🥚 — a pump.fun-style launchpad on Robinhood Chain

Anyone can hatch a coin. 1B supply, 800M sold on a bonding curve, 200M reserved for
liquidity. When the curve sells out, the pot + reserved tokens go into Uniswap v2 and
the LP tokens are burned (liquidity locked forever). The 1% trade fee is split three
ways: 0.5% to the coin's creator (claimable on their coin page), 0.2% auto-buys the coin
back and burns it, 0.3% to you. Nothing is skimmed from the pot at graduation.

```
contracts/   Solidity (Foundry project) — the money engine. 12 passing tests incl. fuzz.
web/         React site (Vite) — browse, hatch, trade. Deploys to Vercel as a static site.
```

---

## Part 1 — One-time setup (~15 min)

1. **Deployer wallet.** Create a FRESH wallet in MetaMask just for deploying (never your
   main wallet — the private key touches your terminal). Also decide on a **treasury
   wallet** where fees will arrive; use a separate, secure wallet for that.

2. **Get ETH on Robinhood Chain.** Bridge a small amount of ETH (0.02 is plenty for
   deployment; gas is cheap) from Ethereum/Arbitrum using the bridge linked in the
   [Robinhood Chain docs](https://docs.robinhood.com/chain/). Add the network to
   MetaMask: Chain ID `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`,
   symbol `ETH`, explorer `https://robinhoodchain.blockscout.com`.

3. **Install Foundry** (Mac/Linux/WSL):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

---

## Part 2 — Deploy the contract (~5 min)

```bash
cd contracts
forge install foundry-rs/forge-std   # pulls the test/script library
forge build                          # should compile clean
forge test                           # all 12 tests should pass

export PRIVATE_KEY=0x...             # your fresh deployer wallet key
export TREASURY=0x...                # your fee-collection wallet address

forge script script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --broadcast
```

Copy the deployed **contract address** and the **block number** from the output.

**Verify it on Blockscout** (so users can read the code — critical for trust):
```bash
forge verify-contract <YOUR_CONTRACT_ADDRESS> \
  src/FlockLaunchpad.sol:FlockLaunchpad \
  --chain-id 4663 \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256,uint256,uint256,uint256)" \
    0x89e5DB8B5aA49aA85AC63f691524311AEB649eba <TREASURY> \
    1000000000000000000 1073000000000000000000000000 100 0 2000)
```

### Changing the economics
All parameters are set in `contracts/script/Deploy.s.sol` before you deploy:
- `1 ether` virtual ETH + `1_073_000_000 ether` virtual tokens → selling out the curve
  collects ~2.93 ETH, and the graduation price matches the Uniswap listing price (no jump).
- `100` = 1% fee on every buy and sell. Creator always gets half; `2000` = 20% of the
  fee is used for buyback-and-burn; the remainder (30%) goes to your treasury.
- graduation fee is set to `0` (raising it makes the platform look extractive — see the
  trust page pitch before changing this).

If you change the virtual reserves, keep virtual tokens > 800M and sanity-check that
`(k / 273M) / 200M ≈ final curve price` so graduation stays smooth.

---

## Part 3 — Deploy the website (~10 min)

1. Edit `web/src/config.ts`:
   - `LAUNCHPAD_ADDRESS` → your contract address
   - `DEPLOY_BLOCK` → the deployment block number (with an `n` suffix, e.g. `123456n`)
   - `TREASURY_ADDRESS` → your treasury wallet (shown publicly on the /trust page)
   - Optionally swap `RPC_URL` for a free [Alchemy](https://alchemy.com) Robinhood Chain
     endpoint — the public RPC works but Alchemy is more reliable under load.

2. Test locally:
   ```bash
   cd web && npm install && npm run dev
   ```

3. Deploy: push this repo to GitHub, import it in [Vercel](https://vercel.com),
   set the **root directory to `web`**, framework "Vite". Done — Vercel auto-builds
   on every push.

---

## Part 4 — Before you promote this publicly

- [ ] **Smart contract audit.** The tests pass and the design is deliberately simple,
      but this contract custodies user ETH. Pay a professional firm (or at minimum run
      it through several independent reviewers) before real volume arrives. Budget
      $5–15k for a small-scope audit.
- [ ] **Legal review.** Operating a token launchpad from Ontario has securities-law
      exposure (OSC/CSA). Talk to a crypto-savvy lawyer about structure, terms of
      service, and geoblocking requirements before marketing it.
- [ ] **Terms of service + risk disclosure page** on the site.
- [ ] **Dry run:** hatch a test coin yourself, buy it from a second wallet, sell some,
      then buy it out completely (~3 ETH) and confirm it graduates to Uniswap and the
      LP tokens land at `0x...dEaD`.
- [ ] Consider deploying to **testnet first** (chain id 46630, faucet at
      faucet.testnet.chain.robinhood.com) — identical steps, zero cost.

## How the money flows

| Event | Who pays | Who receives |
|---|---|---|
| Every buy/sell | trader (1% of ETH) | 0.5% coin creator, 0.2% buyback-burned, 0.3% your treasury |
| Graduation | nothing skimmed | full pot + 200M tokens → Uniswap, LP burned |

Creator fees accrue in the contract and are claimed via a banner that appears on their
coin's page when they connect their wallet.

The launchpad contract itself has **no owner and no admin functions** — you cannot
pause it, upgrade it, or withdraw the pots. That's a feature: it's what makes it
credibly rug-proof for users, and it's your main marketing line.
