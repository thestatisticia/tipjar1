'use client';

import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { CreatorProvider } from '@/providers/CreatorProvider';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const autoOpened = useRef(false);

  // Pop the Privy login modal over the current page (no redirect)
  useEffect(() => {
    if (ready && !authenticated && !autoOpened.current) {
      autoOpened.current = true;
      login();
    }
  }, [ready, authenticated, login]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    // Shown behind / after dismissing the Privy modal
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-up rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent font-mono text-lg font-bold text-accent-foreground">
            G$
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">Sign in required</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Connect your wallet or email to access your creator dashboard.
          </p>
          <button
            onClick={login}
            className="mt-6 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Connect & sign in
          </button>
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
