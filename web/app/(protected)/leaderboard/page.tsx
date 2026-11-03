'use client';

import dynamic from 'next/dynamic';

const CreatorsLeaderboard = dynamic(() => import('@/components/CreatorsLeaderboard'), { ssr: false });

export default function LeaderboardPage() {
  return <CreatorsLeaderboard />;
}
