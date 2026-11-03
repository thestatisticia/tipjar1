import { NextRequest, NextResponse } from 'next/server';
import { getReceivedTipStats, getSentTipStats } from '@/lib/db';

// GET /api/tips/stats?username=foo&wallet=0x...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const wallet = searchParams.get('wallet');

  if (!username && !wallet) {
    return NextResponse.json({ error: 'username or wallet param is required' }, { status: 400 });
  }

  const [received, sent] = await Promise.all([
    username ? getReceivedTipStats(username) : Promise.resolve({ total: 0, count: 0 }),
    wallet ? getSentTipStats(wallet) : Promise.resolve({ total: 0, count: 0 }),
  ]);

  return NextResponse.json({
    totalReceived: received.total,
    receivedCount: received.count,
    totalTipped: sent.total,
    sentCount: sent.count,
  });
}
