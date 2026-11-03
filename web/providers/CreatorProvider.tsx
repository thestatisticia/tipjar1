'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAccount } from 'wagmi';

export interface Creator {
  id?: string;
  username: string;
  wallet_address: string;
  name: string;
  bio: string;
  youtube: string;
  twitter: string;
  avatar_url?: string;
  gooddollar_verified?: boolean;
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
  tipStatsError: boolean;
  isLoading: boolean;
  walletAddress: `0x${string}` | '';
  setCreator: (c: Creator) => void;
  setTips: (t: Tip[]) => void;
  refreshTips: () => Promise<void>;
  refreshTipStats: () => Promise<void>;
  addTip: (tip: Tip) => Promise<void>;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

export function CreatorProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const walletAddress = address ?? '';
  return (
    <CreatorWalletProvider key={walletAddress || 'disconnected'} walletAddress={walletAddress}>
      {children}
    </CreatorWalletProvider>
  );
}

function CreatorWalletProvider({ children, walletAddress }: { children: ReactNode; walletAddress: `0x${string}` | '' }) {
  const [creator, setCreator] = useState<Creator>(() => ({
    username: '', wallet_address: walletAddress, name: '', bio: '', youtube: '', twitter: '',
  }));
  const [tips, setTips] = useState<Tip[]>([]);
  const [sentTips, setSentTips] = useState<Tip[]>([]);
  const [tipStats, setTipStats] = useState<TipStats>({
    totalReceived: 0,
    receivedCount: 0,
    totalTipped: 0,
    sentCount: 0,
  });
  const [tipStatsError, setTipStatsError] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(walletAddress));

  useEffect(() => {
    if (!walletAddress) return;
    (async () => {
      try {
        const [sentTipsRes, res] = await Promise.all([
          fetch(`/api/tips?wallet=${walletAddress}`),
          fetch(`/api/profile?wallet=${walletAddress}`),
        ]);
        if (sentTipsRes.ok) setSentTips(await sentTipsRes.json());

        if (res.ok) {
          const profile = await res.json();
          setCreator(profile);
          const [tipsRes, statsRes] = await Promise.all([
            fetch(`/api/tips?username=${profile.username}`),
            fetch(`/api/tips/stats?username=${profile.username}&wallet=${walletAddress}`),
          ]);
          if (tipsRes.ok) setTips(await tipsRes.json());
          if (statsRes.ok) setTipStats(await statsRes.json());
          else setTipStatsError(true);
        } else {
          const statsRes = await fetch(`/api/tips/stats?wallet=${walletAddress}`);
          if (statsRes.ok) setTipStats(await statsRes.json());
          else setTipStatsError(true);
        }
      } catch (error) {
        console.error('Creator dashboard data load failed:', error);
        setTipStatsError(true);
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

  const refreshTipStats = async () => {
    if (!walletAddress) return;
    try {
      const params = creator.username
        ? `username=${encodeURIComponent(creator.username)}&wallet=${encodeURIComponent(walletAddress)}`
        : `wallet=${encodeURIComponent(walletAddress)}`;
      const response = await fetch(`/api/tips/stats?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load tip statistics.');
      setTipStats(data);
      setTipStatsError(false);
    } catch (error) {
      console.error('Tip statistics refresh failed:', error);
      setTipStatsError(true);
    }
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
      creator, tips, sentTips, tipStats, tipStatsError, isLoading, walletAddress,
      setCreator, setTips, refreshTips, refreshTipStats, addTip,
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
