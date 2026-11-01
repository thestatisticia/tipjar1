import { NextRequest, NextResponse } from 'next/server';
import { getTopCreatorsByTips } from '@/lib/db';

// GET /api/leaderboard/creators?limit=10
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get('limit') || '10');
  const limit = Number.isFinite(rawLimit) ? rawLimit : 10;

  const leaderboard = await getTopCreatorsByTips(limit);
  return NextResponse.json(leaderboard);
}
