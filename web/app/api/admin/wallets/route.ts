import { NextRequest, NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { MAIN_ADMIN_WALLET } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';

type WalletAction = 'list' | 'add' | 'remove';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const auth = body.auth as TaskAuth | undefined;
  const verified = await verifyTaskAuth(
    auth,
    'POST',
    '/api/admin/wallets',
    body,
    false,
    'tipjar_campaign_auth_nonces',
  );
  if (isAuthFailure(verified)) return verified;
  if (verified.address.toLowerCase() !== MAIN_ADMIN_WALLET.toLowerCase()) {
    return NextResponse.json({ error: 'Only the main admin wallet can manage reviewers.' }, { status: 403 });
  }

  const actionValue = body.action;
  if (actionValue !== 'list' && actionValue !== 'add' && actionValue !== 'remove') {
    return NextResponse.json({ error: 'Wallet action is invalid.' }, { status: 400 });
  }
  const action: WalletAction = actionValue;

  const supabase = createServerSupabaseClient();
  if (action === 'list') {
    const { data, error } = await supabase
      .from('tipjar_admin_wallets')
      .select('wallet_address,added_by,created_at')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Admin wallet list failed:', error);
      return NextResponse.json(
        { error: 'Could not load admin wallets. Apply the admin-wallet migration.' },
        { status: 503 },
      );
    }
    return NextResponse.json(data);
  }

  if (typeof body.walletAddress !== 'string' || !isAddress(body.walletAddress)) {
    return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }
  const walletAddress = getAddress(body.walletAddress).toLowerCase();
  if (walletAddress === MAIN_ADMIN_WALLET.toLowerCase()) {
    return NextResponse.json({ error: 'The main admin wallet cannot be changed.' }, { status: 400 });
  }

  if (action === 'add') {
    const { error } = await supabase
      .from('tipjar_admin_wallets')
      .upsert(
        { wallet_address: walletAddress, added_by: verified.address.toLowerCase() },
        { onConflict: 'wallet_address' },
      );
    if (error) {
      console.error('Admin wallet add failed:', error);
      return NextResponse.json({ error: 'Could not add this admin wallet.' }, { status: 503 });
    }
  } else {
    const { error } = await supabase
      .from('tipjar_admin_wallets')
      .delete()
      .eq('wallet_address', walletAddress);
    if (error) {
      console.error('Admin wallet removal failed:', error);
      return NextResponse.json({ error: 'Could not remove this admin wallet.' }, { status: 503 });
    }
  }

  return NextResponse.json({ walletAddress, action });
}
