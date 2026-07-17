import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { robinhoodChain } from './config'
import App from './App'
import './styles.css'

const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [
    injected(),
    walletConnect({
      projectId: 'b56b3d7cdf239b5e121bece5eae7684d',
      showQrModal: true,
      // Pin Uniswap Wallet + MetaMask to the top of the WalletConnect picker so
      // they're one tap away instead of hidden under "All Wallets".
      qrModalOptions: {
        explorerRecommendedWalletIds: [
          'c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a', // Uniswap Wallet
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        ],
      },
      metadata: {
        name: 'FLOCK',
        description: 'Launch memecoins on Robinhood Chain',
        url: 'https://www.launchonflock.xyz',
        icons: [],
      },
    }),
  ],
  transports: { [robinhoodChain.id]: http() },
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
