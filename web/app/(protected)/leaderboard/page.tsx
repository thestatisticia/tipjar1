'use client';

import dynamic from 'next/dynamic';

const CommunityLeaderboard = dynamic(() => import('@/components/CommunityLeaderboard'), { ssr: false });

export default function LeaderboardPage() {
  return <CommunityLeaderboard />;
}
