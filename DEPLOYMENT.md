# FLOCK — Live Deployment Record

Deployed: July 16, 2026

## The contract (the important part — save this!)

| What | Value |
|---|---|
| **Contract address** | `0x4fCB7e55d956ac057d394970A81D8300408296C8` |
| Network | Robinhood Chain mainnet (chain id 4663) |
| Deploy block | 10,932,779 |
| Deploy transaction | `0xc69325dcb0623dbe0e4bf7dec7c52a864f2335ec534936f5d85474f417871571` |
| Explorer page | https://robinhoodchain.blockscout.com/address/0x4fCB7e55d956ac057d394970A81D8300408296C8 |
| Source verified | Yes (Blockscout, solc 0.8.26, optimizer 200 runs, EVM london) |

## Economics (baked in forever, cannot be changed)

| Setting | Value |
|---|---|
| Trade fee | 1% of every buy and sell |
| → Coin creator | 0.5% (half the fee) |
| → Buyback & burn | 0.2% (20% of the fee) |
| → Your treasury | 0.3% (the rest) |
| Graduation fee | 0 (nothing skimmed from the pot) |
| Treasury (your MetaMask) | `0xdd38a67e38c12Bf28c28530859C37bCd1E5F940a` |
| Uniswap v2 router | `0x89e5DB8B5aA49aA85AC63f691524311AEB649eba` (official) |
| Curve | 1 ETH / 1.073B tokens virtual reserves; sells out at ~2.93 ETH |

The contract has **no owner and no admin functions**. Nobody — including you —
can pause it, upgrade it, or withdraw the pots. Fees flow automatically:
your 0.3% arrives at your treasury wallet on every trade, no claiming needed.

## Verification checks performed

- Compiled clean with zero warnings (solc 0.8.26)
- 31/31 lifecycle tests passed on a simulated chain (curve math, fees,
  refunds, graduation, solvency invariants, reentrancy paths)
- All 7 constructor parameters read back from the live contract and confirmed
- Uniswap router address matches Uniswap's official deployments list
- Source code verified on Blockscout

## The deployer wallet

A throwaway wallet (`0xC2bB33d731615fF01E99FFe07e9A0eC26d9A10aE`) deployed the
contract. Its leftover ETH (0.00948) was returned to your MetaMask. The
deployer has no special power over the contract — it can be forgotten.

## Website

`web/src/config.ts` is already wired to the live contract. Build with
`npm install && npm run build` in `web/` — output lands in `web/dist`.

## Still to do (from the project README)

- [ ] Host the website (Vercel free plan; optional custom domain later)
- [ ] Dry run: hatch a test coin, buy/sell it from another wallet
- [ ] Professional smart-contract audit before promoting publicly
- [ ] Legal review (Ontario securities exposure) + terms of service page
