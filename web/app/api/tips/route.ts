import { NextRequest, NextResponse } from 'next/server';
import { getCreator, getTips, getSentTips, addTip } from '@/lib/db';
import { createPublicClient, decodeEventLog, decodeFunctionData, defineChain, formatUnits, http, type Log } from 'viem';
import { TIPJAR_REGISTRY_ABI, TIPJAR_REGISTRY_ADDRESS } from '@/lib/contracts';

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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const { creator_username, sender_name, sender_address, tx_hash } = body;

  if (
    typeof creator_username !== 'string' || !creator_username.trim() ||
    typeof tx_hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(tx_hash)
  ) {
    return NextResponse.json({ error: 'A creator username and transaction hash are required.' }, { status: 400 });
  }

  const creator = await getCreator(creator_username);
  if (!creator) return NextResponse.json({ error: 'Creator not found.' }, { status: 404 });

  let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
  let transaction: Awaited<ReturnType<typeof publicClient.getTransaction>>;
  try {
    const hash = tx_hash as `0x${string}`;
    [receipt, transaction] = await Promise.all([
      publicClient.getTransactionReceipt({ hash }),
      publicClient.getTransaction({ hash }),
    ]);
  } catch (error) {
    console.error('Tip transaction lookup failed:', error);
    return NextResponse.json({ error: 'Could not verify the tip transaction on Celo.' }, { status: 503 });
  }
  if (receipt.status !== 'success') {
    return NextResponse.json({ error: 'The tip transaction did not succeed on Celo.' }, { status: 400 });
  }
  if (transaction.to?.toLowerCase() !== TIPJAR_REGISTRY_ADDRESS.toLowerCase()) {
    return NextResponse.json({ error: 'Transaction was not sent to the creator registry.' }, { status: 400 });
  }

  let submittedTip;
  try {
    submittedTip = decodeFunctionData({
      abi: TIPJAR_REGISTRY_ABI,
      data: transaction.input,
    });
  } catch {
    return NextResponse.json({ error: 'Transaction is not a valid creator tip call.' }, { status: 400 });
  }
  if (
    submittedTip.functionName !== 'sendTip' ||
    submittedTip.args[0].toLowerCase() !== creator_username.toLowerCase()
  ) {
    return NextResponse.json({ error: 'Transaction targets a different creator.' }, { status: 400 });
  }

  const tipLog = receipt.logs.find((log: Log) => {
    if (log.address.toLowerCase() !== TIPJAR_REGISTRY_ADDRESS.toLowerCase()) return false;
    try {
      const event = decodeEventLog({
        abi: TIPJAR_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      return event.eventName === 'TipSent' &&
        event.args.to.toLowerCase() === creator.wallet_address.toLowerCase() &&
        event.args.amount === submittedTip.args[1] &&
        event.args.message === submittedTip.args[2] &&
        event.args.amount > BigInt(0);
    } catch {
      return false;
    }
  });
  if (!tipLog) {
    return NextResponse.json({ error: 'Transaction does not contain a matching creator tip.' }, { status: 400 });
  }

  const event = decodeEventLog({
    abi: TIPJAR_REGISTRY_ABI,
    data: tipLog.data,
    topics: tipLog.topics,
    strict: true,
  });
  if (
    event.eventName !== 'TipSent' ||
    event.args.from.toLowerCase() !== transaction.from.toLowerCase() ||
    (typeof sender_address === 'string' && sender_address.trim() &&
      sender_address.toLowerCase() !== event.args.from.toLowerCase())
  ) {
    return NextResponse.json({ error: 'Tip sender does not match the confirmed transaction.' }, { status: 400 });
  }

  const amount = Number(formatUnits(event.args.amount, 18));
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: 'Confirmed tip amount cannot be represented.' }, { status: 400 });
  }
  const displayName = typeof sender_name === 'string' ? sender_name.trim().slice(0, 80) : '';

  const tip = await addTip({
    creator_username,
    sender_name: displayName || 'Anonymous Fan',
    sender_address: event.args.from.toLowerCase(),
    amount,
    message: event.args.message,
    tx_hash: tx_hash.toLowerCase(),
  });

  if (!tip) {
    return NextResponse.json({ error: 'Failed to save tip' }, { status: 500 });
  }

  return NextResponse.json({ success: true, tip });
}
