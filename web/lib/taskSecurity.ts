import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { MAIN_ADMIN_WALLET } from '@/lib/admin';
import { taskSignatureMessage } from '@/lib/taskMessages';

export interface TaskAuth {
  address: string;
  nonce: string;
  issuedAt: string;
  signature: `0x${string}`;
}

export async function verifyTaskAuth(
  auth: TaskAuth | undefined,
  method: string,
  path: string,
  payload: unknown,
  adminOnly = false,
  nonceTable:
    | 'tipjar_task_auth_nonces'
    | 'tipjar_campaign_auth_nonces'
    | 'tipjar_spin_auth_nonces' = 'tipjar_task_auth_nonces',
): Promise<{ address: `0x${string}` } | NextResponse> {
  if (!auth || !isAddress(auth.address) || !/^0x[0-9a-fA-F]{130}$/.test(auth.signature)) {
    return NextResponse.json({ error: 'A valid wallet signature is required.' }, { status: 401 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auth.nonce)) {
    return NextResponse.json({ error: 'Invalid request nonce.' }, { status: 400 });
  }

  const issuedAt = Date.parse(auth.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Signature expired. Please retry the request.' }, { status: 401 });
  }

  let message: string;
  try {
    message = taskSignatureMessage(method, path, {
      ...auth,
      address: getAddress(auth.address),
    }, payload);
    if (!(await verifyMessage({ address: auth.address, message, signature: auth.signature }))) {
      return NextResponse.json({ error: 'Wallet signature is invalid.' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Wallet signature is invalid.' }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: 'Task storage is not configured on the server.' }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  if (adminOnly) {
    let isAdmin = auth.address.toLowerCase() === MAIN_ADMIN_WALLET.toLowerCase();

    if (!isAdmin) {
      const { data: allowlistedWallet, error: allowlistError } = await supabase
        .from('tipjar_admin_wallets')
        .select('wallet_address')
        .eq('wallet_address', auth.address.toLowerCase())
        .maybeSingle();
      if (allowlistError) {
        console.error('Admin wallet authorization lookup failed:', allowlistError);
        return NextResponse.json(
          { error: 'Admin wallet access is not configured. Apply the admin-wallet migration.' },
          { status: 503 },
        );
      }
      isAdmin = Boolean(allowlistedWallet);
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin reviewer access is required.' }, { status: 403 });
    }
  }

  const { error } = await supabase.from(nonceTable).insert({
    nonce: auth.nonce,
    wallet_address: getAddress(auth.address).toLowerCase(),
    issued_at: new Date(issuedAt).toISOString(),
  });
  if (error?.code === '23505') {
    return NextResponse.json({ error: 'This signed request has already been used.' }, { status: 409 });
  }
  if (error) {
    console.error('Wallet signature nonce persistence failed:', error);
    return NextResponse.json({ error: 'Could not validate request nonce.' }, { status: 503 });
  }

  return { address: getAddress(auth.address) };
}

export function isAuthFailure(
  result: { address: `0x${string}` } | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
