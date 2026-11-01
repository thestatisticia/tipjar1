'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallets } from '@privy-io/react-auth';

export interface Creator {
  id?: string;
  username: string;
  wallet_address: string;
  name: string;
  bio: string;
  youtube: string;
  twitter: string;
  avatar_url?: string;
}

export interface Tip {
  id?: string;
  creator_username: string;
  sender_name: string;
  sender_address: string;
  amount: number;
  message: string;
  tx_hash?: string | null;
  created_at?: string;
}

export interface TipStats {
  totalReceived: number;
  receivedCount: number;
  totalTipped: number;
  sentCount: number;
}

interface CreatorContextValue {
  creator: Creator;
  tips: Tip[];
  sentTips: Tip[];
  tipStats: TipStats;
  isLoading: boolean;
  walletAddress: `0x${string}` | '';
  setCreator: (c: Creator) => void;
  setTips: (t: Tip[]) => void;
  refreshTips: () => Promise<void>;
  addTip: (tip: Tip) => Promise<void>;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

export function CreatorProvider({ children }: { children: ReactNode }) {
  // wallets[0] is the most recently connected wallet — follows the active login
  const { wallets } = useWallets();
  const walletAddress = (wallets[0]?.address ?? '') as `0x${string}` | '';

  const [creator, setCreator] = useState<Creator>({
    username: '', wallet_address: '', name: '', bio: '', youtube: '', twitter: '',
  });
  const [tips, setTips] = useState<Tip[]>([]);
  const [sentTips, setSentTips] = useState<Tip[]>([]);
  const [tipStats, setTipStats] = useState<TipStats>({
    totalReceived: 0,
    receivedCount: 0,
    totalTipped: 0,
    sentCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // (Re)load the profile whenever the active wallet changes
  useEffect(() => {
    const emptyCreator: Creator = {
      username: '', wallet_address: walletAddress, name: '', bio: '', youtube: '', twitter: '',
    };
    // Reset state so a wallet switch never shows the previous wallet's data
    setCreator(emptyCreator);
    setTips([]);
    setSentTips([]);
    setTipStats({ totalReceived: 0, receivedCount: 0, totalTipped: 0, sentCount: 0 });

    if (!walletAddress) { setIsLoading(false); return; }
    setIsLoading(true);
    (async () => {
      try {
        const sentTipsRes = await fetch(`/api/tips?wallet=${walletAddress}`);
        if (sentTipsRes.ok) setSentTips(await sentTipsRes.json());

        const res = await fetch(`/api/profile?wallet=${walletAddress}`);
        if (res.ok) {
          const profile = await res.json();
          setCreator(profile);
          const tipsRes = await fetch(`/api/tips?username=${profile.username}`);
          if (tipsRes.ok) setTips(await tipsRes.json());
          const statsRes = await fetch(`/api/tips/stats?username=${profile.username}&wallet=${walletAddress}`);
          if (statsRes.ok) setTipStats(await statsRes.json());
        } else {
          const statsRes = await fetch(`/api/tips/stats?wallet=${walletAddress}`);
          if (statsRes.ok) setTipStats(await statsRes.json());
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [walletAddress]);

  const refreshTips = async () => {
    if (!creator.username) return;
    const res = await fetch(`/api/tips?username=${creator.username}`);
    if (res.ok) setTips(await res.json());
  };

  const addTip = async (newTip: Tip) => {
    const res = await fetch('/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTip),
    });
    const data = await res.json();
    if (data.success) setTips((prev) => [data.tip, ...prev]);
    else setTips((prev) => [newTip, ...prev]);
  };

  return (
    <CreatorContext.Provider value={{
      creator, tips, sentTips, tipStats, isLoading, walletAddress,
      setCreator, setTips, refreshTips, addTip,
    }}>
      {children}
    </CreatorContext.Provider>
  );
}

export function useCreator() {
  const ctx = useContext(CreatorContext);
  if (!ctx) throw new Error('useCreator must be used inside CreatorProvider');
  return ctx;
}
