import { NextRequest, NextResponse } from 'next/server';
import { getTopCreatorsByTips } from '@/lib/db';
import { isGoodDollarVerifiedAddress } from '@/lib/goodDollarVerification';

// GET /api/leaderboard/creators?limit=10
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get('limit') || '10');
  const limit = Number.isFinite(rawLimit) ? rawLimit : 10;

  try {
    const creators = await getTopCreatorsByTips(limit);
    const spotlight = await Promise.all(creators.map(async ({ walletAddress, ...creator }) => ({
      ...creator,
      gooddollar_verified: walletAddress
        ? await isGoodDollarVerifiedAddress(walletAddress)
        : false,
    })));
    return NextResponse.json(spotlight);
  } catch (error) {
    console.error('Creator spotlight verification failed:', error);
    return NextResponse.json({ error: 'Could not load verified creator spotlight.' }, { status: 503 });
  }
}
