'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Check, LogOut, Share2, Sun, Moon } from 'lucide-react';
import { useDisconnect } from 'wagmi';
import { useCreator } from '@/providers/CreatorProvider';

const PAGE_LABELS: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/admin':        'Admin approvals',
  '/tasks':        'Explore tasks',
  '/campaigns':    'Campaigns',
  '/notifications':'Notifications',
  '/share':        'My public page',
  '/spin':         'Daily rewards',
  '/preview':      'My public page',
  '/leaderboard':  'Discover creators',
  '/settings':     'Settings',
  '/how-it-works': 'Help & support',
};

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export default function Navbar() {
  const [copied, setCopied] = useState(false);
  const [disconnectError, setDisconnectError] = useState('');
  const { disconnectAsync } = useDisconnect();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { creator, walletAddress } = useCreator();
  const username = creator.username;

  const copyLink = () => {
    if (!username) return;
    navigator.clipboard.writeText(`${window.location.origin}/tip/${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = async () => {
    setDisconnectError('');
    try {
      await disconnectAsync();
    } catch (error) {
      console.error('Wallet disconnect failed:', error);
      setDisconnectError('Could not disconnect wallet.');
    }
  };

  return (
    <header className="fixed top-0 right-0 left-60 z-30 flex h-14 items-center justify-between border-b border-line bg-background/80 px-6 backdrop-blur-md max-md:left-0">
      {/* Left — page title */}
      <h1 className="font-display text-[15px] font-semibold tracking-tight">
        {PAGE_LABELS[pathname] ?? 'Dashboard'}
      </h1>

      {/* Right — actions */}
      <div className="flex items-center gap-2">
        {/* Network */}
        <span className="flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 font-mono text-[11px] font-semibold text-success max-sm:hidden">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          Celo
        </span>

        {/* Wallet */}
        {walletAddress && (
          <div className="flex items-center gap-1 rounded-full border border-line bg-card p-0.5">
            <span className="px-2 font-mono text-[11px] text-muted-foreground max-sm:hidden">
              {shortAddr(walletAddress)}
            </span>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              title={disconnectError || 'Disconnect wallet'}
              aria-label={disconnectError || 'Disconnect wallet'}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}

        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        )}

        {/* Share */}
        {username && (
          <button
            onClick={copyLink}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-all ${
              copied
                ? 'bg-success text-white'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            <span className="max-sm:hidden">{copied ? 'Copied!' : 'Share'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
