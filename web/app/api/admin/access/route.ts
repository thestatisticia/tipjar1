import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { MAIN_ADMIN_WALLET } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Admin access is not configured on the server.' }, { status: 503 });
  }

  if (wallet.toLowerCase() === MAIN_ADMIN_WALLET.toLowerCase()) {
    return NextResponse.json({ authorized: true });
  }

  const { data, error } = await createServerSupabaseClient()
    .from('tipjar_admin_wallets')
    .select('wallet_address')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('Admin navigation access lookup failed:', error);
    return NextResponse.json({ error: 'Could not check admin access.' }, { status: 503 });
  }
  return NextResponse.json({ authorized: Boolean(data) });
}
