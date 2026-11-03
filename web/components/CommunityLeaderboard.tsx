'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';

interface CommunityEarner {
  rank: number;
  walletAddress: string;
  totalEarned: string;
  tasksCompleted: number;
  campaignsCompleted: number;
}

function formatEarned(rawAmount: string) {
  const [whole, rawFraction = ''] = formatUnits(BigInt(rawAmount), 18).split('.');
  const fraction = rawFraction.slice(0, 2).replace(/0+$/, '');
  return `${new Intl.NumberFormat().format(BigInt(whole))}${fraction ? `.${fraction}` : ''} G$`;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function CommunityLeaderboard() {
  const [items, setItems] = useState<CommunityEarner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/leaderboard/community')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load community earners.');
        return res.json() as Promise<CommunityEarner[]>;
      })
      .then(setItems)
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load community earners.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="leaderboard" className="mx-auto w-full max-w-[min(1680px,94vw)] scroll-mt-24 px-6 py-16 2xl:px-10 max-lg:max-w-6xl max-lg:px-5 max-md:py-12">
      <div className="glass-panel rounded-2xl border border-line p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Community spotlight
            </p>
            <h3 className="mt-1 font-display text-2xl font-bold tracking-tight">
              Top earners in the community
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">All-time rewards earned</p>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-line bg-background/40" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="rounded-xl bg-danger-bg p-4 text-sm text-danger">{error}</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-background/40 p-8 text-center">
            <p className="text-sm font-semibold">No community earnings yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Approved task and campaign rewards will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {items.map((item) => (
              <div key={item.walletAddress} className="rounded-xl border border-line bg-background/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Rank #{item.rank}
                  </span>
                  {item.rank === 1 && <span className="rounded-full bg-accent/70 px-2.5 py-1 text-[10px] font-bold">Top earner</span>}
                </div>
                <p className="mt-3 truncate font-mono text-sm font-semibold" title={item.walletAddress}>
                  {shortenAddress(item.walletAddress)}
                </p>
                <p className="mt-1 font-display text-2xl font-bold tracking-tight">{formatEarned(item.totalEarned)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.tasksCompleted} tasks · {item.campaignsCompleted} campaigns
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
