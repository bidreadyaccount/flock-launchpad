import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { robinhoodChain, LAUNCHPAD_ADDRESS, DEPLOY_BLOCK } from './config'
import { launchpadAbi, parseMeta, type TokenMeta } from './abi'
import { DEMO_MODE } from './config'
import { demoCoins, demoTrades } from './demo'

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
})

const tokenCreatedEvent = parseAbiItem(
  'event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI, address pair)'
)
const tradeEvent = parseAbiItem(
  'event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 virtualEth, uint256 virtualToken)'
)

export type CoinInfo = {
  token: `0x${string}`
  creator: `0x${string}`
  name: string
  symbol: string
  meta: TokenMeta
  createdBlock: bigint
  pair: `0x${string}`
  // live curve state
  virtualEth: bigint
  virtualToken: bigint
  realEth: bigint
  tokensSold: bigint
  complete: boolean
  graduated: boolean
  progressBps: number
}

async function fetchCurve(token: `0x${string}`) {
  const c = (await publicClient.readContract({
    address: LAUNCHPAD_ADDRESS,
    abi: launchpadAbi,
    functionName: 'curves',
    args: [token],
  })) as [string, bigint, bigint, bigint, bigint, boolean, boolean, string]
  return {
    virtualEth: c[1],
    virtualToken: c[2],
    realEth: c[3],
    tokensSold: c[4],
    complete: c[5],
    graduated: c[6],
    pair: c[7] as `0x${string}`,
  }
}

/** All launched coins with live curve state */
export function useCoins() {
  return useQuery({
    queryKey: ['coins'],
    refetchInterval: 8000,
    queryFn: async (): Promise<CoinInfo[]> => {
      if (DEMO_MODE) return demoCoins
      const logs = await publicClient.getLogs({
        address: LAUNCHPAD_ADDRESS,
        event: tokenCreatedEvent,
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      })
      // M-02: build each coin in isolation. A single malformed log/token must
      // never reject the whole query and blank the entire list.
      const built = await Promise.all(
        logs.map(async (log) => {
          try {
            const token = log.args.token as `0x${string}`
            const curve = await fetchCurve(token)
            const progressBps = Number((curve.tokensSold * 10000n) / (800_000_000n * 10n ** 18n))
            return {
              token,
              creator: log.args.creator as `0x${string}`,
              name: String(log.args.name ?? '').slice(0, 64),
              symbol: String(log.args.symbol ?? '').slice(0, 16),
              meta: parseMeta((log.args.metadataURI as string) || ''),
              createdBlock: log.blockNumber,
              ...curve,
              progressBps,
            } as CoinInfo
          } catch {
            return null // drop just this coin
          }
        })
      )
      return built.filter((c): c is CoinInfo => c !== null).reverse() // newest first
    },
  })
}

export function useCoin(token: `0x${string}` | undefined) {
  const coins = useCoins()
  const coin = coins.data?.find((c) => c.token.toLowerCase() === token?.toLowerCase())
  return { ...coins, coin }
}

export type TradePoint = {
  isBuy: boolean
  trader: string
  ethAmount: bigint
  tokenAmount: bigint
  price: number // ETH per token after this trade
  block: bigint
  tx: string
}

/** Trade history for one coin (drives the chart + activity feed) */
export function useTrades(token: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ['trades', token],
    enabled: !!token,
    refetchInterval: 8000,
    queryFn: async (): Promise<TradePoint[]> => {
      if (DEMO_MODE) return demoTrades(token ? parseInt(token.slice(2, 6)) : 1)
      const logs = await publicClient.getLogs({
        address: LAUNCHPAD_ADDRESS,
        event: tradeEvent,
        args: { token },
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      })
      return logs.map((l) => ({
        isBuy: l.args.isBuy as boolean,
        trader: l.args.trader as string,
        ethAmount: l.args.ethAmount as bigint,
        tokenAmount: l.args.tokenAmount as bigint,
        price: Number(l.args.virtualEth) / Number(l.args.virtualToken),
        block: l.blockNumber,
        tx: l.transactionHash,
      }))
    },
  })
}
