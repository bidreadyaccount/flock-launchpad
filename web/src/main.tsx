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
