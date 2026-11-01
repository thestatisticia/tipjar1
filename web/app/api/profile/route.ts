import { NextRequest, NextResponse } from 'next/server';
import { getCreator, getCreatorByWallet, upsertCreator } from '@/lib/db';

// GET /api/profile?username=foo  OR  /api/profile?wallet=0x...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const wallet = searchParams.get('wallet');

  if (!username && !wallet) {
    return NextResponse.json({ error: 'Provide username or wallet param' }, { status: 400 });
  }

  const creator = username
    ? await getCreator(username)
    : await getCreatorByWallet(wallet!);

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  return NextResponse.json(creator);
}

// POST /api/profile  — create or update creator profile
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, wallet_address, name, bio, youtube, twitter, avatar_url } = body;

  if (!username || !wallet_address) {
    return NextResponse.json({ error: 'username and wallet_address are required' }, { status: 400 });
  }

  const creator = await upsertCreator({
    username,
    wallet_address,
    name: name || '',
    bio: bio || '',
    youtube: youtube || '',
    twitter: twitter || '',
    avatar_url: avatar_url || '',
    is_active: true,
  });

  if (!creator) {
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }

  return NextResponse.json({ success: true, profile: creator });
}
