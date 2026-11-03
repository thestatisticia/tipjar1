'use client';

import { WagmiProvider, createConfig } from 'wagmi';
import { injected } from '@wagmi/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { defineChain } from 'viem';

const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
  blockExplorers: { default: { name: 'Celoscan', url: 'https://celoscan.io' } },
});

const wagmiConfig = createConfig({
  chains: [celo],
  connectors: [injected({ target: 'metaMask', shimDisconnect: false })],
  transports: { [celo.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}
