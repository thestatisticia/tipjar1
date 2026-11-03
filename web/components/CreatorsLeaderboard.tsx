'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LeaderboardEntry {
  rank: number;
  username: string;
  name: string;
  avatarUrl: string;
  totalReceived: number;
  tipsCount: number;
}

export default function CreatorsLeaderboard() {
  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboard/creators?limit=10')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LeaderboardEntry[]) => setItems(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="leaderboard" className="mx-auto w-full max-w-[min(1680px,94vw)] scroll-mt-24 px-6 py-16 2xl:px-10 max-lg:max-w-6xl max-lg:px-5 max-md:py-12">
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Leaderboard
            </p>
            <h3 className="mt-1 font-display text-2xl font-bold tracking-tight">
              Most tipped creators
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">All-time G$ received</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-background/40" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-background/40 p-8 text-center">
            <p className="text-sm font-semibold">No leaderboard data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Tips will appear here once creators start receiving G$.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.username} className="flex items-center gap-3 rounded-xl border border-line bg-background px-3 py-2.5">
                <div className="w-7 text-center font-mono text-xs font-bold text-muted-foreground">
                  #{item.rank}
                </div>
                <Link href={`/tip/${item.username}`} className="shrink-0">
                  {item.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.avatarUrl}
                      alt={`${item.name} avatar`}
                      className="h-9 w-9 rounded-full border border-line object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                      {(item.name || item.username).charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/tip/${item.username}`} className="block truncate text-sm font-semibold hover:underline">
                    {item.name || item.username}
                  </Link>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">@{item.username}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-bold">{item.totalReceived.toLocaleString()} G$</p>
                  <p className="text-[11px] text-muted-foreground">{item.tipsCount} tips</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
