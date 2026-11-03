'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccount, useConnect } from 'wagmi';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { CreatorProvider } from '@/providers/CreatorProvider';
import { getWalletConnectionErrorMessage } from '@/lib/walletErrors';
import GoodHubLogo from '@/components/GoodHubLogo';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const [connectError, setConnectError] = useState('');

  const handleConnect = async () => {
    const metaMask = connectors.find((connector) => connector.id === 'metaMask');
    if (!metaMask) {
      setConnectError('MetaMask is not available. Install the MetaMask browser extension and try again.');
      return;
    }

    setConnectError('');
    try {
      await connectAsync({ connector: metaMask, chainId: 42220 });
    } catch (error) {
      setConnectError(getWalletConnectionErrorMessage(error));
    }
  };

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-up rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
          <GoodHubLogo className="h-10 w-[170px]" />
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">Connect MetaMask</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Connect your MetaMask wallet to access your GOODHUB dashboard.
          </p>
          {connectError && (
            <p role="alert" className="mt-4 text-sm text-danger">{connectError}</p>
          )}
          <button
            onClick={handleConnect}
            disabled={isPending}
            className="mt-6 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isPending ? 'Connecting…' : 'Connect MetaMask'}
          </button>
          <Link href="/" className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <CreatorProvider>
        <div className="min-h-screen">
          <Sidebar />
          <Navbar />
          <main className="ml-60 min-h-screen px-8 pt-22 pb-10 max-md:ml-0 max-md:px-4 max-md:pt-20 max-md:pb-24">
            {children}
          </main>
        </div>
      </CreatorProvider>
    </AuthGuard>
  );
}
