import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
} from 'viem';
import { ubiSchemeV2ABI } from '@goodsdks/citizen-sdk';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getGoodDollarVerifiedRootAddress, GoodDollarVerificationUnavailableError } from '@/lib/goodDollarVerification';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';
import {
  chooseSpinOutcome,
  G_DOLLAR_PRIZES,
  getSpinTreasuryAddress,
  sendSpinPayout,
  SPIN_DAILY_CAP_G,
  SPIN_UBI_SCAN_BLOCKS,
  SpinPayoutSubmittedError,
} from '@/lib/spinWheel';
import { getSpinOutcome, SPIN_OUTCOMES } from '@/lib/spinWheelConfig';

const UBI_SCHEME_ADDRESS = '0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1';
const UBI_SOURCE_REF = /^(0x[0-9a-fA-F]{64}):(\d+)$/;
const TASK_SOURCE_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
});

interface SpinAward {
  id: string;
  source_type: 'ubi_claim' | 'task_completion';
  source_ref: string;
  outcome: string;
  prize_g: number;
  status: 'pending' | 'paid' | 'failed';
  payout_tx_hash: string | null;
  created_at: string;
  paid_at: string | null;
}

function isPrize(value: number): value is (typeof G_DOLLAR_PRIZES)[number] {
  return G_DOLLAR_PRIZES.some((prize) => prize === value);
}

function getPublicClient() {
  return createPublicClient({
    chain: celo,
    transport: http(process.env.GOODDOLLAR_RPC_URL || 'https://forno.celo.org'),
  });
}

async function getRecentUbiClaims(rootAddress: Address) {
  const publicClient = getPublicClient();
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock > SPIN_UBI_SCAN_BLOCKS
    ? currentBlock - SPIN_UBI_SCAN_BLOCKS
    : BigInt(0);
  const claims: Array<{ sourceRef: string; transactionHash: Hex; logIndex: number }> = [];
  const batchSize = BigInt(2000);

  for (let start = fromBlock; start <= currentBlock; start += batchSize) {
    const end = start + batchSize - BigInt(1) > currentBlock
      ? currentBlock
      : start + batchSize - BigInt(1);
    const logs = await publicClient.getLogs({
      address: UBI_SCHEME_ADDRESS,
      event: parseAbiItem('event UBIClaimed(address indexed account, uint256 amount)'),
      args: { account: rootAddress },
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      if (!log.transactionHash || log.logIndex === null) continue;
      claims.push({
        sourceRef: `${log.transactionHash}:${log.logIndex}`,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      });
    }
  }

  return claims;
}

function getUtcDayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

async function getVerifiedRoot(wallet: string) {
  try {
    const root = await getGoodDollarVerifiedRootAddress(wallet);
    if (!root) {
      return {
        response: NextResponse.json({ error: 'A GoodDollar-verified wallet is required to spin from a UBI claim.' }, { status: 403 }),
      };
    }
    return { root };
  } catch (error) {
    if (error instanceof GoodDollarVerificationUnavailableError) {
      return { response: NextResponse.json({ error: error.message }, { status: 503 }) };
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }

  try {
    const root = await getGoodDollarVerifiedRootAddress(getAddress(wallet));

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Spin storage is not configured on the server.' }, { status: 503 });
    }
    const supabase = createServerSupabaseClient();
    const normalizedWallet = wallet.toLowerCase();
    const [awardsResult, submissionsResult, claims] = await Promise.all([
      supabase
        .from('tipjar_spin_awards')
        .select('id,source_type,source_ref,outcome,prize_g,status,payout_tx_hash,created_at,paid_at')
        .eq('wallet_address', normalizedWallet)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('tipjar_task_submissions')
        .select('id,task_id,updated_at')
        .eq('worker_address', normalizedWallet)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(500),
      root ? getRecentUbiClaims(root) : Promise.resolve([]),
    ]);

    if (awardsResult.error) {
      console.error('Spin award lookup failed:', awardsResult.error);
      return NextResponse.json({ error: 'Could not load spin history.' }, { status: 503 });
    }
    if (submissionsResult.error) {
      console.error('Task spin lookup failed:', submissionsResult.error);
      return NextResponse.json({ error: 'Could not load completed-task spins.' }, { status: 503 });
    }

    const awards = (awardsResult.data || []) as SpinAward[];
    const usedSources = new Set(awards.map((award) => `${award.source_type}:${award.source_ref}`));
    const taskSpins = (submissionsResult.data || [])
      .filter((submission) => !usedSources.has(`task_completion:${submission.id}`))
      .map((submission) => ({
        sourceType: 'task_completion' as const,
        sourceRef: submission.id,
        label: 'Completed task',
        availableAt: submission.updated_at,
      }));
    const ubiSpins = claims
      .filter((claim) => !usedSources.has(`ubi_claim:${claim.sourceRef}`))
      .map((claim) => ({
        sourceType: 'ubi_claim' as const,
        sourceRef: claim.sourceRef,
        label: 'Daily UBI claim',
      }));
    const utcDayStart = getUtcDayStart();
    const spentToday = awards
      .filter((award) => award.created_at >= utcDayStart && award.status !== 'failed')
      .reduce((sum, award) => sum + Number(award.prize_g), 0);

    let treasuryAddress: Address | null = null;
    try {
      treasuryAddress = getSpinTreasuryAddress();
    } catch (error) {
      console.error('Spin treasury key is invalid:', error);
      return NextResponse.json({ error: 'The spin reward treasury is misconfigured.' }, { status: 503 });
    }

    return NextResponse.json({
      verified: root !== null,
      treasuryConfigured: treasuryAddress !== null,
      treasuryAddress,
      prizes: G_DOLLAR_PRIZES,
      outcomes: SPIN_OUTCOMES.map(({ id, label, prizeG, color }) => ({
        id,
        label,
        prizeG,
        color,
      })),
      dailyCapG: SPIN_DAILY_CAP_G,
      spentTodayG: spentToday,
      availableSpins: [...ubiSpins, ...taskSpins],
      history: awards.slice(0, 20),
    });
  } catch (error) {
    console.error('Spin status lookup failed:', error);
    return NextResponse.json({ error: 'Could not verify spin eligibility on Celo.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const auth = body.auth as TaskAuth | undefined;
  const verifiedAuth = await verifyTaskAuth(
    auth,
    'POST',
    '/api/spins',
    body,
    false,
    'tipjar_spin_auth_nonces',
  );
  if (isAuthFailure(verifiedAuth)) return verifiedAuth;

  const { sourceType, sourceRef } = body;
  if (
    (sourceType !== 'ubi_claim' && sourceType !== 'task_completion') ||
    typeof sourceRef !== 'string'
  ) {
    return NextResponse.json({ error: 'Spin source is invalid.' }, { status: 400 });
  }

  try {
    if (sourceType === 'ubi_claim') {
      const verified = await getVerifiedRoot(verifiedAuth.address);
      if ('response' in verified) return verified.response;

      const match = UBI_SOURCE_REF.exec(sourceRef);
      if (!match) {
        return NextResponse.json({ error: 'UBI claim reference is invalid.' }, { status: 400 });
      }

      const transactionHash = match[1] as Hex;
      const logIndex = Number(match[2]);
      const publicClient = getPublicClient();
      const [receipt, currentBlock] = await Promise.all([
        publicClient.getTransactionReceipt({ hash: transactionHash }),
        publicClient.getBlockNumber(),
      ]);
      if (
        receipt.status !== 'success' ||
        currentBlock - receipt.blockNumber > SPIN_UBI_SCAN_BLOCKS
      ) {
        return NextResponse.json({ error: 'This UBI claim is not recent or successful.' }, { status: 400 });
      }

      const matchingClaim = receipt.logs.some((log: Log) => {
        if (log.address.toLowerCase() !== UBI_SCHEME_ADDRESS.toLowerCase() || log.logIndex !== logIndex) return false;
        try {
          const parsed = decodeEventLog({
            abi: ubiSchemeV2ABI,
            eventName: 'UBIClaimed',
            data: log.data,
            topics: log.topics,
          });
          return parsed.args.account.toLowerCase() === verified.root.toLowerCase();
        } catch {
          return false;
        }
      });
      if (!matchingClaim) {
        return NextResponse.json({ error: 'The transaction does not contain your verified UBI claim.' }, { status: 400 });
      }
    } else {
      if (!TASK_SOURCE_REF.test(sourceRef)) {
        return NextResponse.json({ error: 'Task completion reference is invalid.' }, { status: 400 });
      }
      const supabase = createServerSupabaseClient();
      const { data: submission, error } = await supabase
        .from('tipjar_task_submissions')
        .select('id')
        .eq('id', sourceRef)
        .eq('worker_address', verifiedAuth.address.toLowerCase())
        .eq('status', 'approved')
        .maybeSingle();
      if (error) {
        console.error('Task spin verification failed:', error);
        return NextResponse.json({ error: 'Could not verify task completion.' }, { status: 503 });
      }
      if (!submission) {
        return NextResponse.json({ error: 'Only approved task completions earn an extra spin.' }, { status: 403 });
      }
    }

    const supabase = createServerSupabaseClient();
    const candidateOutcome = chooseSpinOutcome();
    const { data: reservationData, error: reservationError } = await supabase.rpc(
      'tipjar_reserve_spin_award',
      {
        p_wallet_address: verifiedAuth.address.toLowerCase(),
        p_source_type: sourceType,
        p_source_ref: sourceRef,
        p_outcome: candidateOutcome.id,
        p_prize_g: candidateOutcome.prizeG,
        p_daily_cap_g: SPIN_DAILY_CAP_G,
      },
    );
    if (reservationError) {
      console.error('Spin award reservation failed:', reservationError);
      return NextResponse.json({ error: 'Could not reserve this spin.' }, { status: 503 });
    }

    const reservation = Array.isArray(reservationData) ? reservationData[0] : null;
    if (!reservation || typeof reservation.reservation_status !== 'string') {
      console.error('Spin award reservation returned an invalid result:', reservationData);
      return NextResponse.json({ error: 'Could not reserve this spin.' }, { status: 503 });
    }
    if (reservation.reservation_status === 'cap_reached') {
      return NextResponse.json({
        error: 'Today’s 3,000 G$ reward budget has been reached. Your spin remains available tomorrow.',
        capReached: true,
      }, { status: 409 });
    }
    if (typeof reservation.award_id !== 'string') {
      console.error('Spin award reservation did not return an award ID:', reservation);
      return NextResponse.json({ error: 'Could not reserve this spin.' }, { status: 503 });
    }

    const awardId = reservation.award_id;
    const prizeG = Number(reservation.prize_g);
    if (!isPrize(prizeG)) {
      console.error('Spin award reservation returned an invalid prize:', reservation);
      return NextResponse.json({ error: 'The selected spin prize is invalid.' }, { status: 503 });
    }
    const outcome = typeof reservation.outcome === 'string'
      ? getSpinOutcome(reservation.outcome)
      : undefined;
    if (!outcome || outcome.prizeG !== prizeG) {
      console.error('Spin award reservation returned an invalid outcome:', reservation);
      return NextResponse.json({ error: 'The selected spin outcome is invalid.' }, { status: 503 });
    }

    const { data: existingAward, error: existingError } = await supabase
      .from('tipjar_spin_awards')
      .select('outcome,status,payout_tx_hash')
      .eq('id', awardId)
      .single();
    if (existingError || !existingAward) {
      console.error('Reserved spin award could not be loaded:', existingError);
      return NextResponse.json({ error: 'Could not load the reserved spin.' }, { status: 503 });
    }

    if (reservation.reservation_status === 'existing' && existingAward.status === 'paid') {
      return NextResponse.json({
        prizeG,
        outcome: existingAward.outcome,
        outcomeLabel: getSpinOutcome(existingAward.outcome)?.label ?? outcome.label,
        payoutTxHash: existingAward.payout_tx_hash,
        status: 'paid',
        replayed: true,
      });
    }
    if (prizeG === 0 && existingAward.status === 'pending') {
      const { error: noPrizeError } = await supabase
        .from('tipjar_spin_awards')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', awardId)
        .eq('status', 'pending');
      if (noPrizeError) {
        console.error('Zero-prize spin could not be reconciled:', noPrizeError);
        return NextResponse.json({ error: 'The spin result could not be recorded.' }, { status: 503 });
      }
      return NextResponse.json({
        prizeG,
        outcome: existingAward.outcome,
        outcomeLabel: getSpinOutcome(existingAward.outcome)?.label ?? outcome.label,
        payoutTxHash: null,
        status: 'paid',
      });
    }
    if (reservation.reservation_status === 'existing' && existingAward.status === 'pending') {
      if (!existingAward.payout_tx_hash) {
        return NextResponse.json({ prizeG, outcome: existingAward.outcome, outcomeLabel: outcome.label, status: 'pending' }, { status: 202 });
      }
      try {
        const receipt = await getPublicClient().getTransactionReceipt({
          hash: existingAward.payout_tx_hash as Hex,
        });
        if (receipt.status === 'success') {
          const { error } = await supabase
            .from('tipjar_spin_awards')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', awardId)
            .eq('status', 'pending');
          if (error) {
            console.error('Spin payout reconciliation failed:', error);
            return NextResponse.json({ error: 'The payout is confirmed, but its status could not be saved.' }, { status: 503 });
          }
          return NextResponse.json({
            prizeG,
            outcome: existingAward.outcome,
            outcomeLabel: getSpinOutcome(existingAward.outcome)?.label ?? outcome.label,
            payoutTxHash: existingAward.payout_tx_hash,
            status: 'paid',
            replayed: true,
          });
        }
        await supabase
          .from('tipjar_spin_awards')
          .update({ status: 'failed' })
          .eq('id', awardId)
          .eq('status', 'pending');
      } catch (error) {
        console.error('Spin payout reconciliation lookup failed:', error);
        return NextResponse.json({
          prizeG,
          outcome: existingAward.outcome,
          outcomeLabel: getSpinOutcome(existingAward.outcome)?.label ?? outcome.label,
          payoutTxHash: existingAward.payout_tx_hash,
          status: 'pending',
        }, { status: 202 });
      }
    }

    if (prizeG === 0) {
      const { error: noPrizeError } = await supabase
        .from('tipjar_spin_awards')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', awardId)
        .eq('status', 'pending');
      if (noPrizeError) {
        console.error('Zero-prize spin could not be recorded:', noPrizeError);
        return NextResponse.json({ error: 'The spin result could not be recorded.' }, { status: 503 });
      }
      return NextResponse.json({
        prizeG,
        outcome: outcome.id,
        outcomeLabel: outcome.label,
        payoutTxHash: null,
        status: 'paid',
      });
    }

    const payoutTxHash = await sendSpinPayout(
      verifiedAuth.address,
      prizeG,
      async (transactionHash) => {
        const { error } = await supabase
          .from('tipjar_spin_awards')
          .update({ payout_tx_hash: transactionHash })
          .eq('id', awardId)
          .eq('status', 'pending');
        if (error) throw error;
      },
    );

    const { error: paidError } = await supabase
      .from('tipjar_spin_awards')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', awardId)
      .eq('status', 'pending');
    if (paidError) {
      console.error('Spin payout was confirmed but could not be recorded:', paidError);
      return NextResponse.json({
        prizeG,
        outcome: outcome.id,
        outcomeLabel: outcome.label,
        payoutTxHash,
        status: 'pending',
      }, { status: 202 });
    }

    return NextResponse.json({ prizeG, outcome: outcome.id, outcomeLabel: outcome.label, payoutTxHash, status: 'paid' });
  } catch (error) {
    if (error instanceof SpinPayoutSubmittedError) {
      console.error('Spin payout transaction was submitted but not saved:', error);
      const supabase = createServerSupabaseClient();
      const sourceTypeValue = sourceType === 'ubi_claim' || sourceType === 'task_completion' ? sourceType : null;
      if (sourceTypeValue && typeof sourceRef === 'string') {
        const { data: award, error: lookupError } = await supabase
          .from('tipjar_spin_awards')
          .select('id')
          .eq('source_type', sourceTypeValue)
          .eq('source_ref', sourceRef)
          .eq('wallet_address', verifiedAuth.address.toLowerCase())
          .maybeSingle();
        if (lookupError) {
          console.error('Could not reload the spin award after payout submission:', lookupError);
        } else if (award) {
          const { error: saveHashError } = await supabase
            .from('tipjar_spin_awards')
            .update({ payout_tx_hash: error.transactionHash })
            .eq('id', award.id)
            .eq('status', 'pending');
          if (saveHashError) console.error('Could not persist submitted spin payout hash:', saveHashError);
        }
      }
      return NextResponse.json({
        error: 'The reward transfer was submitted; refresh shortly to confirm its status.',
        prizeG: null,
        payoutTxHash: error.transactionHash,
        status: 'pending',
      }, { status: 202 });
    }

    console.error('Spin request failed:', error);
    const supabase = createServerSupabaseClient();
    const sourceTypeValue = sourceType === 'ubi_claim' || sourceType === 'task_completion' ? sourceType : null;
    if (sourceTypeValue && typeof sourceRef === 'string') {
      const { data: pendingAward } = await supabase
        .from('tipjar_spin_awards')
        .select('id,payout_tx_hash')
        .eq('source_type', sourceTypeValue)
        .eq('source_ref', sourceRef)
        .eq('wallet_address', verifiedAuth.address.toLowerCase())
        .maybeSingle();
      if (pendingAward && !pendingAward.payout_tx_hash) {
        const { error } = await supabase
          .from('tipjar_spin_awards')
          .update({ status: 'failed' })
          .eq('id', pendingAward.id)
          .eq('status', 'pending');
        if (error) console.error('Failed spin reservation could not be released:', error);
      }
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not complete the spin payout.',
    }, { status: 503 });
  }
}
