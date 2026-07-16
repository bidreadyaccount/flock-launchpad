import type { CoinInfo, TradePoint } from './hooks'

// Simple SVG avatars as data URIs so demo works fully offline
const svg = (bg: string, emoji: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><text x="50" y="62" font-size="46" text-anchor="middle">${emoji}</text></svg>`
  )

const E18 = 10n ** 18n
const mk = (
  i: number, name: string, symbol: string, desc: string, img: string,
  soldM: number, graduated = false
): CoinInfo => {
  const sold = BigInt(soldM) * 1_000_000n * E18
  const vT = 1_073_000_000n * E18 - sold
  const vE = (1_073_000_000n * E18 * E18) / vT // k / vT with k = 1e18 * 1.073e9e18
  return {
    token: (`0x${(i + 1).toString().padStart(4, '0')}` + 'f'.repeat(36)) as `0x${string}`,
    creator: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    name, symbol,
    meta: { description: desc, image: img },
    createdBlock: 1000n + BigInt(i),
    virtualEth: vE,
    virtualToken: vT,
    realEth: graduated ? 0n : vE - E18,
    tokensSold: graduated ? 800_000_000n * E18 : sold,
    complete: graduated,
    graduated,
    progressBps: graduated ? 10000 : Math.round((soldM / 800) * 10000),
  }
}

export const demoCoins: CoinInfo[] = [
  mk(0, 'Robin Hood Classic', 'ROBIN', 'steal from the rich, give to the holders', svg('%23FF6B4A', '🏹'), 690),
  mk(1, 'Worm Getter', 'EARLY', 'the early bird gets the worm. are you early?', svg('%2353D3C4', '🪱'), 410),
  mk(2, 'Feather Standard', 'PLUME', 'sound money. very light. floats up.', svg('%23f2ede4', '🪶'), 260),
  mk(3, 'Night Owl', 'HOOT', 'trades while you sleep', svg('%23232C3D', '🦉'), 120),
  mk(4, 'Egg Salad', 'YOLK', 'scrambled tokenomics, sunny side up', svg('%23ffce56', '🍳'), 55),
  mk(5, 'First Fledge', 'FLEW', 'the first coin to graduate. now on Uniswap.', svg('%2310151F', '🐦'), 800, true),
]

// Random-walk trade history for the token page chart
export function demoTrades(seed: number): TradePoint[] {
  const out: TradePoint[] = []
  let vE = 1e18
  let vT = 1.073e9 * 1e18
  let rng = seed + 42
  const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let i = 0; i < 60; i++) {
    const isBuy = rand() > 0.35
    const eth = (0.005 + rand() * 0.08) * 1e18 * (isBuy ? 1 : -1)
    const k = vE * vT
    vE = Math.max(1e18, vE + eth)
    vT = k / vE
    out.push({
      isBuy,
      trader: '0x' + Math.floor(rand() * 1e15).toString(16).padStart(40, 'a'),
      ethAmount: BigInt(Math.floor(Math.abs(eth))),
      tokenAmount: BigInt(Math.floor(Math.abs(eth) / (vE / vT))),
      price: vE / vT,
      block: 1000n + BigInt(i),
      tx: '0x' + i.toString(16).padStart(64, '0'),
    })
  }
  return out
}
