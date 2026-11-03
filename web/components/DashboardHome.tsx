'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Heart, ArrowRight, ArrowUpRight, Loader2, X, Bell,
  ListTodo, Megaphone, RotateCw, Search, Wallet, Clock3, Copy,
} from 'lucide-react';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readContractQueryKey } from '@wagmi/core/query';
import { useCreator } from '@/providers/CreatorProvider';
import { useGDollarBalance } from '@/hooks/useGDollarBalance';
import { ERC20_ABI, G_DOLLAR_ADDRESS } from '@/lib/contracts';
import { useDashboardActivity } from '@/hooks/useDashboardActivity';
import { addLocalActivity, notifyActivityChanged } from '@/lib/notificationState';

interface CreatorDashboardStats {
  taskEarnings: string;
  campaignEarnings: string;
  pendingSpinRewards: string;
  approvedPosts: number;
}

interface DashboardOpportunity {
  id: string;
  title: string;
  description: string;
  reward: string;
  kind: 'task' | 'campaign';
  availableCount: number;
  creatorAddress: string;
  expiresAt: string | null;
}

async function loadDashboardOpportunities(): Promise<DashboardOpportunity[]> {
  const [tasksResponse, campaignsResponse] = await Promise.all([
    fetch('/api/tasks'),
    fetch('/api/campaigns'),
  ]);
  const [tasks, campaigns] = await Promise.all([tasksResponse.json(), campaignsResponse.json()]);
  if (!tasksResponse.ok || !campaignsResponse.ok) {
    throw new Error(tasks.error || campaigns.error || 'Could not load opportunities.');
  }
  return [
    ...(tasks as Array<{ id: string; title: string; description: string; reward_per_completion: string; slots: number; creator_address: string; expires_at: string | null }>)
      .slice(0, 2)
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        description: task.description,
        reward: task.reward_per_completion,
        kind: 'task' as const,
        availableCount: task.slots,
        creatorAddress: task.creator_address,
        expiresAt: task.expires_at,
      })),
    ...(campaigns as Array<{ id: string; title: string; description: string; reward_per_participant: string; available_participants: number; creator_address: string; expires_at: string | null }>)
      .slice(0, 2)
      .map((campaign) => ({
        id: `campaign-${campaign.id}`,
        title: campaign.title,
        description: campaign.description,
        reward: campaign.reward_per_participant,
        kind: 'campaign' as const,
        availableCount: campaign.available_participants,
        creatorAddress: campaign.creator_address,
        expiresAt: campaign.expires_at,
      })),
  ].slice(0, 3);
}

interface SpinStatus {
  availableSpins: Array<{ sourceType: 'ubi_claim' | 'task_completion' }>;
}

function formatAmount(amount: string, decimals = 18) {
  return Number(formatUnits(BigInt(amount), decimals))
    .toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDeadline(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function activityStatusClass(status: string) {
  const normalized = status.toLowerCase();
  if (['approved', 'paid', 'received', 'sent'].includes(normalized)) return 'bg-success-bg text-success';
  if (['rejected', 'failed'].includes(normalized)) return 'bg-danger-bg text-danger';
  return 'bg-muted text-muted-foreground';
}

export default function DashboardHome() {
  const { creator, tips, sentTips, tipStats, tipStatsError, refreshTipStats, walletAddress, isLoading: creatorLoading } = useCreator();
  const { balance: gBalance, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useGDollarBalance(walletAddress || undefined);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: 42220 });
  const queryClient = useQueryClient();
  const activityQuery = useDashboardActivity();
  const creatorStatsQuery = useQuery<CreatorDashboardStats>({
    queryKey: ['creator-dashboard-stats', walletAddress],
    enabled: !!walletAddress,
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/stats?wallet=${walletAddress}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load creator earnings stats.');
      return data;
    },
  });
  const opportunitiesQuery = useQuery({
    queryKey: ['dashboard-opportunities'],
    queryFn: loadDashboardOpportunities,
    staleTime: 60_000,
  });
  const spinStatusQuery = useQuery<SpinStatus>({
    queryKey: ['dashboard-spins', walletAddress],
    enabled: Boolean(walletAddress),
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/spins?wallet=${encodeURIComponent(walletAddress)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load available spins.');
      return data;
    },
  });
  const [activeLedgerTab, setActiveLedgerTab] = useState<'received' | 'sent'>('received');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawBalanceWarning, setWithdrawBalanceWarning] = useState<string | null>(null);
  const [withdrawTxHash, setWithdrawTxHash] = useState<`0x${string}` | null>(null);
  const [withdrawTxStatus, setWithdrawTxStatus] = useState<'pending' | 'confirmed' | 'failed' | null>(null);
  const [receiveMessage, setReceiveMessage] = useState('');

  const historicalEarnings = creatorStatsQuery.data && !creatorStatsQuery.isError && !tipStatsError
    ? tipStats.totalReceived +
      Number(formatUnits(BigInt(creatorStatsQuery.data.taskEarnings), 18)) +
      Number(formatUnits(BigInt(creatorStatsQuery.data.campaignEarnings), 18))
    : null;
  const pendingRewards = creatorStatsQuery.data
    ? Number(BigInt(creatorStatsQuery.data.pendingSpinRewards))
    : null;

  const handleSetMax = () => {
    if (gBalance == null || gBalance <= 0) return;
    setAmount(String(gBalance));
  };

  const handleReceive = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setReceiveMessage('Wallet address copied. Share it to receive G$.');
    } catch (error) {
      console.error('Wallet address copy failed:', error);
      setReceiveMessage('Could not copy the wallet address. Copy it from the navbar instead.');
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawBalanceWarning(null);
    setWithdrawTxHash(null);
    setWithdrawTxStatus(null);

    if (!walletAddress || !walletClient || !publicClient) {
      setWithdrawError('Connect your wallet first.');
      return;
    }
    if (!isAddress(recipient)) {
      setWithdrawError('Enter a valid recipient wallet address.');
      return;
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setWithdrawError('Enter a valid amount greater than 0.');
      return;
    }
    if (gBalance != null && amountNum > gBalance) {
      setWithdrawError('Amount exceeds your G$ balance.');
      return;
    }

    let submittedTxHash: `0x${string}` | null = null;
    try {
      setIsSending(true);
      const parsedAmount = parseUnits(amount, 18);
      const txHash = await walletClient.writeContract({
        address: G_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parsedAmount],
      });

      submittedTxHash = txHash;
      setWithdrawTxHash(txHash);
      setWithdrawTxStatus('pending');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        setWithdrawTxStatus('failed');
        setWithdrawError('The transfer transaction reverted on Celo.');
        return;
      }
      setWithdrawTxStatus('confirmed');
      setAmount('');
      addLocalActivity(walletAddress, {
        id: `wallet:sent:${txHash}`,
        category: 'wallet',
        title: 'G$ sent',
        description: `${formatUnits(parsedAmount, 18)} G$ sent to ${recipient.slice(0, 6)}…${recipient.slice(-4)}`,
        status: 'Sent',
        createdAt: new Date().toISOString(),
        transactionHash: txHash,
      });
      notifyActivityChanged();
      try {
        const confirmedBalance = await publicClient.readContract({
          address: G_DOLLAR_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress],
          blockNumber: receipt.blockNumber,
        });
        queryClient.setQueryData(
          readContractQueryKey({
            address: G_DOLLAR_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletAddress],
            chainId: 42220,
          }),
          confirmedBalance,
        );
      } catch (balanceError: unknown) {
        console.error('G$ transfer confirmed, but confirmed balance refresh failed:', balanceError);
        setWithdrawBalanceWarning('Transfer confirmed. Your balance will update when the next refresh completes.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      if (submittedTxHash) setWithdrawTxStatus('failed');
      setWithdrawError(msg.includes('User rejected') ? 'Transaction rejected.' : 'Transfer failed. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl animate-fade-up flex-col gap-6">
      <div>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {creatorLoading ? 'Welcome' : creator.name.trim() ? `Welcome back, ${creator.name.trim().split(/\s+/)[0]}` : 'Welcome to GOODHUB'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {creator.name.trim()
              ? 'Here’s what’s happening in your Good Hub account today.'
              : 'Find opportunities, follow your rewards, and stay up to date.'}
          </p>
        </div>
      </div>

      {!creator.username && <section className="rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Creator profile</p>
            <h3 className="mt-1 font-display text-lg font-bold">
              {creatorLoading ? 'Loading your profile…' : creator.username ? 'Your public page is active' : 'Activate your public page'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {creatorLoading
                ? 'Checking your saved profile details.'
                : creator.username
                  ? `Share your page at /tip/${creator.username}`
                  : 'Choose a username to activate your page. A display name and bio are optional profile improvements.'}
            </p>
          </div>
          <div className="flex gap-2">
            {creator.username && (
              <a
                href={`/tip/${creator.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-muted"
              >
                View page <ArrowUpRight size={14} />
              </a>
            )}
            <Link href="/settings" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
              {creator.username ? 'Edit profile' : 'Complete profile'} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {[
            { label: 'Choose a username', complete: Boolean(creator.username), required: true },
            { label: 'Add a display name', complete: Boolean(creator.name), required: false },
            { label: 'Write a short bio', complete: Boolean(creator.bio), required: false },
          ].map(({ label, complete, required }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <span className={`h-2 w-2 rounded-full ${complete ? 'bg-success' : 'bg-muted-foreground/40'}`} />
              <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{complete ? 'Done' : required ? 'Required' : 'Optional'}</span>
            </div>
          ))}
        </div>
      </section>}
      {creator.username && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your creator profile</p>
            <p className="mt-1 truncate font-display text-lg font-bold">{creator.name || `@${creator.username}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {creatorLoading || tipStatsError
                ? 'Account activity is temporarily unavailable.'
                : `${tipStats.receivedCount} tips received`}
              {!creatorStatsQuery.isPending && !creatorStatsQuery.isError
                ? ` · ${creatorStatsQuery.data.approvedPosts} campaign posts approved`
                : ''}
              {!spinStatusQuery.isPending && !spinStatusQuery.isError
                ? ` · ${spinStatusQuery.data.availableSpins.length} available spins`
                : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/tip/${creator.username}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold transition-colors hover:bg-muted">
              View page <ArrowUpRight size={14} />
            </Link>
            <Link href="/settings" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
              Edit profile
            </Link>
          </div>
        </section>
      )}

      <section id="wallet" className="scroll-mt-24">
        <div className="mb-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Financial overview</p>
          <h3 className="mt-1 font-display text-lg font-bold">Your G$ activity</h3>
        </div>
        <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-2">
          <article className="col-span-3 rounded-xl border border-accent/70 bg-accent/15 p-5 max-lg:col-span-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wallet size={14} /> Wallet balance</div>
            <p className="mt-2 font-display text-3xl font-bold tracking-tight">
              {balanceLoading ? '…' : balanceError ? 'Unavailable' : (gBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="ml-1 text-sm font-medium text-muted-foreground">G$</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Spendable wallet funds</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleReceive()} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold transition-colors hover:bg-muted">
                  <Copy size={12} /> Receive
                </button>
                <Link href="/leaderboard" className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold transition-colors hover:bg-muted">
                  Tip a creator
                </Link>
                <button type="button" onClick={() => setWithdrawOpen(true)} disabled={balanceError || gBalance == null} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
                  Send G$
                </button>
              </div>
            </div>
            {receiveMessage && <p role="status" className="mt-2 text-xs text-muted-foreground">{receiveMessage}</p>}
            {!balanceLoading && !balanceError && gBalance === 0 && (
              <p className="mt-3 border-t border-line/70 pt-3 text-xs leading-relaxed text-muted-foreground">
                Your wallet is ready. <Link href="/share" className="font-semibold text-primary underline-offset-2 hover:underline">Share your page</Link> to receive G$ tips.
              </p>
            )}
            {balanceError && <button type="button" onClick={() => void refetchBalance()} className="mt-2 text-xs font-semibold text-danger">Retry balance</button>}
          </article>
          <article className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Pending reward payouts</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight">
              {creatorStatsQuery.isPending ? '…' : creatorStatsQuery.isError ? 'Unavailable' : (pendingRewards ?? 0).toLocaleString()}
              <span className="ml-1 text-sm font-medium text-muted-foreground">G$</span>
            </p>
            <Link href="#activity" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View payout activity <ArrowRight size={12} />
            </Link>
          </article>
          <article className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Historical earnings</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight">
              {creatorLoading || creatorStatsQuery.isPending ? '…' : creatorStatsQuery.isError || tipStatsError ? 'Unavailable' : (historicalEarnings ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="ml-1 text-sm font-medium text-muted-foreground">G$</span>
            </p>
            <Link href="#ledger" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View earnings history <ArrowRight size={12} />
            </Link>
          </article>
          <article className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Available spins</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight">
              {spinStatusQuery.isPending ? '…' : spinStatusQuery.isError ? 'Unavailable' : spinStatusQuery.data.availableSpins.length}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Eligible spins</span>
              <Link href="/spin" className="text-xs font-bold text-primary">Open rewards</Link>
            </div>
            {!spinStatusQuery.isPending && !spinStatusQuery.isError && spinStatusQuery.data.availableSpins.length === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">No eligible spins right now. Visit rewards to check current ways to earn one.</p>
            )}
          </article>
        </div>
        <div id="earnings-breakdown" className="mt-3 flex scroll-mt-24 flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-card px-4 py-3 text-xs">
          <span className="font-semibold text-muted-foreground">Historical breakdown</span>
          <span>Tips: {creatorLoading ? '…' : tipStatsError ? 'Unavailable' : tipStats.totalReceived.toLocaleString()} G$</span>
          <span>Tasks: {creatorStatsQuery.isPending ? '…' : creatorStatsQuery.isError ? 'Unavailable' : formatAmount(creatorStatsQuery.data.taskEarnings)} G$</span>
          <span>Campaigns: {creatorStatsQuery.isPending ? '…' : creatorStatsQuery.isError ? 'Unavailable' : formatAmount(creatorStatsQuery.data.campaignEarnings)} G$</span>
          {creatorStatsQuery.isError && (
            <button type="button" onClick={() => void creatorStatsQuery.refetch()} className="font-semibold text-danger">Retry earnings</button>
          )}
          {tipStatsError && (
            <button type="button" onClick={() => void refreshTipStats()} className="font-semibold text-danger">
              Retry tip history
            </button>
          )}
          {spinStatusQuery.isError && (
            <button type="button" onClick={() => void spinStatusQuery.refetch()} className="font-semibold text-danger">Retry spin status</button>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Get involved</p>
          <h3 className="mt-1 font-display text-lg font-bold">Quick actions</h3>
        </div>
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          {[
            { href: '/tasks', label: 'Find tasks', icon: ListTodo },
            { href: '/spin', label: 'Daily rewards', icon: RotateCw },
            { href: '/campaigns', label: 'Explore campaigns', icon: Megaphone },
            { href: '/leaderboard', label: 'Discover creators', icon: Search },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-line bg-card p-4 text-sm font-semibold transition-colors hover:border-foreground/30 hover:bg-muted/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon size={17} />
              </span>
              {label}
              <ArrowRight size={14} className="ml-auto shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Take part</p>
            <h3 className="mt-1 font-display text-lg font-bold">Open opportunities</h3>
          </div>
          <div className="flex gap-4 text-sm font-semibold text-primary">
            <Link href="/tasks">View all tasks</Link>
            <Link href="/campaigns">View all campaigns</Link>
          </div>
        </div>
        {opportunitiesQuery.isPending ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-xl border border-line bg-card" />
            ))}
          </div>
        ) : opportunitiesQuery.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 text-sm text-danger">
            <span>{opportunitiesQuery.error instanceof Error ? opportunitiesQuery.error.message : 'Could not load opportunities.'}</span>
            <button type="button" onClick={() => void opportunitiesQuery.refetch()} className="font-semibold">Retry</button>
          </div>
        ) : opportunitiesQuery.data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-card p-6 text-sm text-muted-foreground">
            No open tasks or campaigns right now. <Link href="/tasks" className="font-semibold text-primary hover:underline">Browse tasks</Link> or <Link href="/campaigns" className="font-semibold text-primary hover:underline">campaigns</Link> again soon.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {opportunitiesQuery.data.map((opportunity) => {
              const isTask = opportunity.kind === 'task';
              const reward = formatAmount(opportunity.reward);
              const deadline = formatDeadline(opportunity.expiresAt);
              const opportunityId = opportunity.id.slice(isTask ? 'task-'.length : 'campaign-'.length);
              return (
                <article key={opportunity.id} className="group flex h-full flex-col rounded-xl border border-line bg-card p-5 transition duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md motion-reduce:transform-none">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {isTask ? 'Task' : 'Campaign'}
                    </span>
                    <span className="rounded-lg bg-accent px-2.5 py-1 font-mono text-sm font-bold text-accent-foreground">{reward} G$</span>
                  </div>
                  <h4 className="mt-4 line-clamp-2 min-h-12 font-display text-lg font-bold leading-snug">{opportunity.title}</h4>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{opportunity.description}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Posted by <span className="font-mono font-medium text-foreground">{opportunity.creatorAddress ? `${opportunity.creatorAddress.slice(0, 6)}…${opportunity.creatorAddress.slice(-4)}` : 'creator details unavailable'}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span>{opportunity.availableCount} {isTask ? 'slots' : 'spots'} available</span>
                    {deadline && <span className="inline-flex items-center gap-1"><Clock3 size={12} /> Due {deadline}</span>}
                  </div>
                  <Link href={isTask ? `/tasks#task-${opportunityId}` : `/campaigns#campaign-${opportunityId}`} className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-primary hover:underline">
                    View details <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="activity" className="scroll-mt-24 rounded-xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Updates</p>
            <h3 className="mt-1 font-display text-lg font-bold">Recent activity</h3>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/notifications" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              <Bell size={14} /> Notifications
            </Link>
            <button
              type="button"
              onClick={() => void activityQuery.loadActivity(Boolean(activityQuery.data))}
              disabled={activityQuery.isFetching}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold disabled:opacity-50"
            >
              {activityQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
              {activityQuery.data ? 'Refresh' : 'Load activity'}
            </button>
          </div>
        </div>
        {activityQuery.isError ? (
          <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
            {activityQuery.error instanceof Error ? activityQuery.error.message : 'Could not load account activity.'}
          </p>
        ) : !activityQuery.data ? (
          <p className="rounded-lg border border-dashed border-line p-5 text-sm text-muted-foreground">
            Load task, campaign, tip, and reward updates associated with your wallet using the button above. It requests a free message signature and does not send a transaction.
          </p>
        ) : activityQuery.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-5 text-sm text-muted-foreground">
            No account activity yet. <Link href="/tasks" className="font-semibold text-primary hover:underline">Explore tasks</Link> or <Link href="/campaigns" className="font-semibold text-primary hover:underline">join a campaign</Link> to get started.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {activityQuery.data.slice(0, 5).map((event) => (
              <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{event.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                  <time dateTime={event.createdAt} className="mt-1 block text-[11px] text-muted-foreground">{formatActivityDate(event.createdAt)}</time>
                  {event.transactionHash && (
                    <a href={`https://celoscan.io/tx/${event.transactionHash}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline">
                      Tx {event.transactionHash.slice(0, 8)}…{event.transactionHash.slice(-4)} <ArrowUpRight size={10} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {event.amount && <span className="font-mono text-xs font-semibold">{event.category === 'tip' ? Number(event.amount).toLocaleString() : formatAmount(event.amount, event.category === 'spin' ? 0 : 18)} G$</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${activityStatusClass(event.status)}`}>{event.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Creator support activity */}
      <section id="ledger" className="scroll-mt-24 rounded-xl border border-line bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-2.5">
          <MessageSquare size={17} className="text-muted-foreground" />
          <h3 className="font-display text-[15px] font-semibold">Creator support activity</h3>
          <div className="flex items-center rounded-lg border border-line bg-background p-1 text-xs">
            <button
              onClick={() => setActiveLedgerTab('received')}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                activeLedgerTab === 'received'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Received
            </button>
            <button
              onClick={() => setActiveLedgerTab('sent')}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                activeLedgerTab === 'sent'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sent
            </button>
          </div>
        </div>

        {activeLedgerTab === 'received' && tips.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Heart size={28} className="text-muted-foreground/30" />
            <p className="text-sm font-semibold">No tips yet</p>
            <p className="text-xs text-muted-foreground">Share your link to start receiving G$.</p>
          </div>
        ) : activeLedgerTab === 'sent' && sentTips.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Heart size={28} className="text-muted-foreground/30" />
            <p className="text-sm font-semibold">No sent tips yet</p>
            <p className="text-xs text-muted-foreground">Tip a creator to see your sent history here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2.5 pr-4 font-semibold">
                    {activeLedgerTab === 'received' ? 'From' : 'To'}
                  </th>
                  <th className="pb-2.5 pr-4 font-semibold">Message</th>
                  <th className="pb-2.5 pr-4 font-semibold">Amount</th>
                  <th className="pb-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {(activeLedgerTab === 'received' ? tips : sentTips).map((tip) => (
                  <tr key={tip.id || tip.created_at} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-4">
                      {activeLedgerTab === 'received' ? (
                        <>
                          <p className="font-semibold">{tip.sender_name}</p>
                          {tip.sender_address && (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {tip.sender_address.slice(0, 6)}…{tip.sender_address.slice(-4)}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="font-semibold">@{tip.creator_username}</p>
                          {tip.tx_hash && (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              tx {tip.tx_hash.slice(0, 10)}…
                            </p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="max-w-xs py-3 pr-4 text-muted-foreground italic">
                      {tip.message ? `"${tip.message}"` : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-xs font-bold text-accent-foreground">
                        {activeLedgerTab === 'received' ? '+' : '-'}{tip.amount} G$
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                      {tip.created_at ? new Date(tip.created_at).toLocaleString() : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {withdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl font-bold tracking-tight">Withdraw G$</h3>
              <button
                onClick={() => setWithdrawOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close withdraw modal"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mb-4 text-xs text-muted-foreground">
              Balance: {gBalance != null ? `${gBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} G$` : '—'}
            </p>

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Recipient address</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  placeholder="0x..."
                  className="w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-foreground/40"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Amount (G$)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) setAmount(value);
                    }}
                    placeholder="0.0"
                    className="w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={handleSetMax}
                    className="h-10 rounded-lg border border-line bg-background px-3 text-xs font-semibold transition-colors hover:border-foreground/30"
                  >
                    Max
                  </button>
                </div>
              </div>

              {withdrawError && (
                <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-xs font-medium text-danger">
                  {withdrawError}
                </p>
              )}
              {withdrawBalanceWarning && (
                <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-xs font-medium text-muted-foreground">
                  {withdrawBalanceWarning}
                </p>
              )}
              {withdrawTxStatus && (
                <p role="status" className={`rounded-lg px-3.5 py-2.5 text-xs font-medium ${
                  withdrawTxStatus === 'confirmed'
                    ? 'bg-success-bg text-success'
                    : withdrawTxStatus === 'failed'
                      ? 'bg-danger-bg text-danger'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {withdrawTxStatus === 'pending'
                    ? 'Transaction submitted. Waiting for Celo confirmation…'
                    : withdrawTxStatus === 'confirmed'
                      ? 'Transfer confirmed on Celo. Balance updated.'
                      : 'Transfer did not complete successfully.'}
                </p>
              )}

              <button
                type="submit"
                disabled={isSending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Withdraw
                    <ArrowUpRight size={16} />
                  </>
                )}
              </button>
            </form>

            {withdrawTxHash && (
              <a
                href={`https://celoscan.io/tx/${withdrawTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                View transaction: {withdrawTxHash.slice(0, 10)}…
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
