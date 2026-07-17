import { defineChain } from 'viem'

// ============================================================
// EDIT THIS FILE AFTER DEPLOYING YOUR CONTRACT (see README)
// ============================================================

/**
 * FlockLaunchpad contract address.
 * Fifth-pass audited contract, deployed to Robinhood Chain mainnet 2026-07-17.
 * Constructor: router 0x89e5…9eba, treasury 0xdd38…f940a, 1e18 / 1.073e27 curve,
 * 1% fee, 0 graduation fee, 20% buyback-burn. Deploy tx
 * 0xc916a567732162f3aceebd16a3a6f750d69bfa726c902400264b47ceae4a08c3.
 */
export const LAUNCHPAD_ADDRESS = '0xf3B1E542aF2E4aCBFA301FD3E8946A199706b89D' as `0x${string}`

/** The block number your contract was deployed at (speeds up event scanning) */
export const DEPLOY_BLOCK = 11857862n

/**
 * RPC endpoint. The public one works, but for a production site create a
 * free Alchemy app for Robinhood Chain and paste your endpoint here.
 */
export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'

/** Robinhood Chain mainnet */
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
})

export const EXPLORER = 'https://robinhoodchain.blockscout.com'

/** Uniswap web app swap link for graduated tokens */
export const uniswapUrl = (token: string) =>
  `https://app.uniswap.org/swap?chain=robinhood&outputCurrency=${token}`

/** Curve constants — must match the contract */
export const CURVE_SUPPLY = 800_000_000n * 10n ** 18n
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n
export const FEE_BPS = 100n // 1%

/**
 * DEMO MODE: set true to preview the site with fake coins before your
 * contract is deployed. Set back to false for production.
 */
export const DEMO_MODE = false

/** Your treasury address — shown publicly on the trust page and footer */
export const TREASURY_ADDRESS = '0xdd38a67e38c12Bf28c28530859C37bCd1E5F940a'
