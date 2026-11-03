import { NextRequest, NextResponse } from 'next/server';
import { getTips, getSentTips, addTip } from '@/lib/db';
import { createPublicClient, defineChain, http } from 'viem';

const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
});

const publicClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
});

async function resolveSenderAddress(senderAddress?: string, txHash?: string | null) {
  if (senderAddress && senderAddress.trim()) return senderAddress.toLowerCase();
  if (!txHash) return '';

  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    return tx.from.toLowerCase();
  } catch {
    return '';
  }
}

// GET /api/tips?username=foo  OR  /api/tips?wallet=0x...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const wallet = searchParams.get('wallet');

  if (!username && !wallet) {
    return NextResponse.json({ error: 'username or wallet param is required' }, { status: 400 });
  }

  const tips = username ? await getTips(username) : await getSentTips(wallet!);
  return NextResponse.json(tips);
}

// POST /api/tips
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { creator_username, sender_name, sender_address, amount, message, tx_hash } = body;

  if (!creator_username || !amount) {
    return NextResponse.json({ error: 'creator_username and amount are required' }, { status: 400 });
  }

  const resolvedSenderAddress = await resolveSenderAddress(sender_address, tx_hash);

  const tip = await addTip({
    creator_username,
    sender_name: sender_name || 'Anonymous Fan',
    sender_address: resolvedSenderAddress,
    amount: parseFloat(amount),
    message: message || '',
    tx_hash: tx_hash || null,
  });

  if (!tip) {
    return NextResponse.json({ error: 'Failed to save tip' }, { status: 500 });
  }

  return NextResponse.json({ success: true, tip });
}
