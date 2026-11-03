'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClaimSDK, IdentitySDK, type WalletClaimStatus } from '@goodsdks/citizen-sdk';
import { formatUnits } from 'viem';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Gift,
  Loader2,
  RotateCw,
  Swords,
  Sparkles,
  HandCoins,
  Wallet,
} from 'lucide-react';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { useTaskSignature } from '@/hooks/useTaskSignature';
import { SPIN_OUTCOMES } from '@/lib/spinWheelConfig';
import RockPaperScissorsGame from '@/components/RockPaperScissorsGame';
import { notifyActivityChanged } from '@/lib/notificationState';

interface AvailableSpin {
  sourceType: 'ubi_claim' | 'task_completion';
  sourceRef: string;
  label: string;
  availableAt?: string;
}

interface SpinOutcome {
  id: string;
  label: string;
  prizeG: number;
  color: string;
}

interface SpinStatus {
  verified: boolean;
  treasuryConfigured: boolean;
  outcomes: SpinOutcome[];
  dailyCapG: number;
  spentTodayG: number;
  availableSpins: AvailableSpin[];
}

function getWedgePath(startAngle: number, sweep: number) {
  const radius = 150;
  const center = 180;
  const startRadians = (startAngle * Math.PI) / 180;
  const endRadians = ((startAngle + sweep) * Math.PI) / 180;
  const startX = center + Math.cos(startRadians) * radius;
  const startY = center + Math.sin(startRadians) * radius;
  const endX = center + Math.cos(endRadians) * radius;
  const endY = center + Math.sin(endRadians) * radius;

  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${endX} ${endY} Z`;
}

function getOutcomeOffset(outcomes: SpinOutcome[], outcomeId: string) {
  const index = outcomes.findIndex((outcome) => outcome.id === outcomeId);
  return index < 0 ? 0 : (index + 0.5) * (360 / outcomes.length);
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

function Wheel({ outcomes, rotation }: { outcomes: SpinOutcome[]; rotation: number }) {
  const segments = outcomes.map((outcome, index) => {
    const sweep = 360 / outcomes.length;
    return { id: outcome.id, color: outcome.color, startAngle: -90 + index * sweep, sweep };
  });

  return (
    <div className="relative aspect-square w-full max-w-[340px]">
      <div className="absolute -bottom-2 left-1/2 z-0 h-12 w-40 -translate-x-1/2 rounded-t-[70%] bg-foreground/90 shadow-lg sm:h-14 sm:w-44" />
      <div className="absolute -bottom-5 left-1/2 z-0 h-4 w-48 -translate-x-1/2 rounded-sm border border-line bg-foreground shadow-md sm:w-52" />

      <div className="absolute inset-0 rounded-full border-[7px] border-primary bg-card p-2 shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
        <div className="relative h-full w-full rounded-full border-[5px] border-line bg-background p-1.5">
          <svg
            aria-label="Colorful prize wheel with seven equal slices"
            className="h-full w-full overflow-visible rounded-full"
            role="img"
            viewBox="0 0 360 360"
          >
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: '180px 180px',
                transition: 'transform 5s cubic-bezier(0.12, 0.72, 0.12, 1)',
              }}
            >
              {segments.map((segment) => {
                const midAngle = segment.startAngle + segment.sweep / 2;
                const radians = (midAngle * Math.PI) / 180;
                const x = 180 + Math.cos(radians) * 102;
                const y = 180 + Math.sin(radians) * 102;
                return (
                  <g key={segment.id}>
                    <path
                      d={getWedgePath(segment.startAngle, segment.sweep)}
                      fill={segment.color}
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth="3"
                    />
                    <text
                      dominantBaseline="middle"
                      fill={segment.id === 'good_luck' || segment.id === 'zero' || segment.id === '200_g'
                        ? '#171717'
                        : '#ffffff'}
                      fontFamily="var(--font-mono)"
                      fontSize={segment.id === 'good_luck' ? 10 : 12}
                      fontWeight="800"
                      paintOrder="stroke"
                      stroke="rgba(0,0,0,0.2)"
                      strokeWidth="1.5"
                      textAnchor="middle"
                      transform={`rotate(${midAngle + 90} ${x} ${y})`}
                      x={x}
                      y={y}
                    >
                      {outcomes.find((outcome) => outcome.id === segment.id)?.label}
                    </text>
                    <path
                      d={getWedgePath(segment.startAngle + 1.5, Math.max(1, segment.sweep - 3))}
                      fill="url(#wheelGloss)"
                      opacity="0.3"
                    />
                  </g>
                );
              })}
              <defs>
                <radialGradient id="wheelGloss" cx="30%" cy="20%" r="85%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                  <stop offset="55%" stopColor="#ffffff" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#101010" stopOpacity="0.18" />
                </radialGradient>
              </defs>
              <circle cx="180" cy="180" r="44" fill="var(--card)" stroke="var(--line)" strokeWidth="4" />
              <circle cx="180" cy="180" r="34" fill="var(--primary)" />
              <text
                dominantBaseline="middle"
                fill="var(--primary-foreground)"
                fontFamily="var(--font-display)"
                fontSize="22"
                fontWeight="800"
                textAnchor="middle"
                x="180"
                y="181"
              >
                G$
              </text>
            </g>
          </svg>
        </div>
      </div>

      <div className="absolute -top-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center drop-shadow-[0_3px_5px_rgba(0,0,0,0.45)]">
        <span className="h-5 w-5 rounded-full border-[3px] border-card bg-accent shadow-[0_0_14px_var(--accent)]" />
        <svg aria-hidden="true" className="-mt-1 h-10 w-9 overflow-visible" viewBox="0 0 36 42">
          <defs>
            <linearGradient id="wheelPointer" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#fcff52" />
              <stop offset="48%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <path d="M4 3 Q18 -2 32 3 L18 38 Z" fill="url(#wheelPointer)" stroke="white" strokeWidth="3" strokeLinejoin="round" />
          <path d="M11 7 Q18 5 25 7 L18 24 Z" fill="#ffffff" fillOpacity="0.88" />
        </svg>
      </div>
      {Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        return (
          <span
            key={index}
            aria-hidden="true"
            className={`absolute z-10 h-2.5 w-2.5 rounded-full border border-card shadow-[0_0_10px_var(--accent)] ${index % 2 ? 'bg-accent' : 'bg-white'}`}
            style={{
              left: `${50 + Math.sin(angle) * 48}%`,
              top: `${50 - Math.cos(angle) * 48}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        );
      })}
    </div>
  );
}

async function getSpinStatus(wallet: string): Promise<SpinStatus> {
  const response = await fetch(`/api/spins?wallet=${encodeURIComponent(wallet)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load spin status.');
  return result as SpinStatus;
}

export default function SpinPage() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const signRequest = useTaskSignature();
  const [selectedGame, setSelectedGame] = useState<'spin' | 'rps'>('spin');
  const [busySource, setBusySource] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastOutcome, setLastOutcome] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [claimNotice, setClaimNotice] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claimCountdown, setClaimCountdown] = useState<{ address: string; time: Date } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const spinQuery = useQuery({
    queryKey: ['spin-wheel', address],
    queryFn: () => getSpinStatus(address!),
    enabled: Boolean(address),
  });
  const spinStatus = spinQuery.data;
  const outcomes = spinStatus?.outcomes ?? [...SPIN_OUTCOMES];
  const ubiClaimQuery = useQuery<WalletClaimStatus>({
    queryKey: ['daily-ubi-claim', address, chainId],
    enabled: Boolean(address && chainId === 42220 && publicClient && walletClient),
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!publicClient || !walletClient) throw new Error('Connect a wallet on Celo to check your UBI claim.');
      const identitySDK = await IdentitySDK.init({
        publicClient,
        walletClient,
        env: 'production',
      });
      const claimSDK = await ClaimSDK.init({
        publicClient,
        walletClient,
        identitySDK,
        env: 'production',
      });
      return claimSDK.getWalletClaimStatus();
    },
  });

  const claimDailyUbi = async () => {
    if (chainId !== 42220) {
      setClaimError('');
      setClaimNotice('');
      try {
        await switchChainAsync({ chainId: 42220 });
      } catch (requestError) {
        setClaimError(requestError instanceof Error ? requestError.message : 'Could not switch to Celo.');
      }
      return;
    }
    if (!publicClient || !walletClient) {
      setClaimError('Connect your wallet on Celo to claim daily UBI.');
      return;
    }

    setClaimBusy(true);
    setClaimError('');
    setClaimNotice('');
    try {
      const identitySDK = await IdentitySDK.init({
        publicClient,
        walletClient,
        env: 'production',
      });
      const claimSDK = await ClaimSDK.init({
        publicClient,
        walletClient,
        identitySDK,
        env: 'production',
      });
      const receipt = await claimSDK.claim();
      if ('status' in receipt && receipt.status !== 'success') {
        throw new Error('The UBI claim transaction was not successful.');
      }

      setClaimNotice('Daily UBI claimed. Your G$ will be sent to your connected wallet.');
      try {
        const nextClaimTime = await claimSDK.nextClaimTime();
        if (address) setClaimCountdown({ address, time: nextClaimTime });
      } catch (refreshError) {
        console.error('UBI claim succeeded, but the next claim time could not be loaded:', refreshError);
        setClaimError('Claim succeeded, but the next claim time could not be loaded. Refresh eligibility to update the countdown.');
      }
      await Promise.all([ubiClaimQuery.refetch(), spinQuery.refetch()]);
    } catch (requestError) {
      setClaimError(requestError instanceof Error ? requestError.message : 'Could not claim daily UBI.');
    } finally {
      setClaimBusy(false);
    }
  };

  const playSpin = async () => {
    const spin = spinStatus?.availableSpins[0];
    if (!spin) return;
    setBusySource(spin.sourceRef);
    setError('');
    setNotice('');
    setLastOutcome('');

    try {
      const payload = { sourceType: spin.sourceType, sourceRef: spin.sourceRef };
      const auth = await signRequest('POST', '/api/spins', payload);
      const response = await fetch('/api/spins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, auth }),
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error || 'Could not complete the spin.');
      }
      notifyActivityChanged();

      if (typeof result.outcome === 'string') {
        const offset = getOutcomeOffset(outcomes, result.outcome);
        setRotation((current) => current + 360 * 6 + ((360 - offset) % 360));
        setLastOutcome(result.outcomeLabel || outcomes.find((outcome) => outcome.id === result.outcome)?.label || '');
      }

      if (result.status === 'paid') {
        setNotice(result.outcomeLabel === 'Good luck'
          ? 'Good luck next time! Thanks for claiming your daily UBI.'
          : result.prizeG === 0
            ? 'No G$ this time. Good luck on your next spin!'
            : `${result.replayed ? 'Your reward was already paid:' : 'Congratulations! You won'} ${result.prizeG} G$.`);
      } else {
        setNotice('Your G$ reward is processing. Refresh in a moment to check its status.');
      }
      await spinQuery.refetch();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not complete the spin.');
    } finally {
      setBusySource('');
    }
  };

  const remainingToday = spinStatus
    ? Math.max(0, spinStatus.dailyCapG - spinStatus.spentTodayG)
    : 0;
  const canPlay = Boolean(
    spinStatus &&
    spinStatus.treasuryConfigured &&
    spinStatus.availableSpins.length > 0 &&
    remainingToday >= 200 &&
    !busySource,
  );
  const ubiSpins = spinStatus?.availableSpins.filter((spin) => spin.sourceType === 'ubi_claim') ?? [];
  const taskSpins = spinStatus?.availableSpins.filter((spin) => spin.sourceType === 'task_completion') ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Daily rewards</p>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-tight">Claim your daily $G</h2>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-primary">GoodDollar UBI on Celo</p>
            <h3 className="mt-1 font-display text-xl font-bold">Daily UBI claim</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Claim your available GoodDollar UBI directly to your wallet. Confirm the onchain claim in your wallet; no token approval is needed, and CELO may be required for network gas.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-56">
            {chainId !== 42220 ? (
              <button
                type="button"
                onClick={claimDailyUbi}
                disabled={claimBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {claimBusy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                Switch to Celo
              </button>
            ) : (
              <button
                type="button"
                onClick={claimDailyUbi}
                disabled={claimBusy || ubiClaimQuery.isPending || ubiClaimQuery.data?.status === 'already_claimed'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {claimBusy || ubiClaimQuery.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <HandCoins size={16} />}
                {claimBusy
                  ? 'Claiming…'
                  : ubiClaimQuery.data?.status === 'can_claim'
                    ? `Claim ${formatUnits(ubiClaimQuery.data.entitlement, 18)} $G`
                    : ubiClaimQuery.data?.status === 'not_whitelisted'
                      ? 'Verify and claim $G'
                      : ubiClaimQuery.data?.status === 'already_claimed'
                        ? 'Claimed for today'
                        : 'Check claim eligibility'}
              </button>
            )}
            {ubiClaimQuery.data?.status === 'already_claimed' && (() => {
              const nextClaimTime = claimCountdown && claimCountdown.address === address
                ? claimCountdown.time
                : ubiClaimQuery.data.nextClaimTime;
              if (!nextClaimTime) return null;
              const remaining = Math.max(0, nextClaimTime.getTime() - now);
              return (
                <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                  {remaining > 0
                    ? `Next claim in ${formatCountdown(remaining)}`
                    : 'Your next claim is ready. Refresh eligibility.'}
                </p>
              );
            })()}
          </div>
        </div>
        {ubiClaimQuery.data?.status === 'not_whitelisted' && (
          <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Complete GoodDollar identity verification to claim UBI.
          </p>
        )}
        {claimNotice && <p role="status" className="mt-4 rounded-lg bg-success-bg p-3 text-sm text-success">{claimNotice}</p>}
        {(claimError || ubiClaimQuery.error) && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-bg p-3 text-sm text-danger">
            {claimError || (ubiClaimQuery.error instanceof Error ? ubiClaimQuery.error.message : 'Could not check UBI claim eligibility.')}
          </p>
        )}
        {chainId === 42220 && ubiClaimQuery.isPending && (
          <p className="mt-3 text-xs text-muted-foreground">Checking your claim eligibility…</p>
        )}
      </section>

      <div className="mb-5 inline-flex rounded-xl border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => setSelectedGame('spin')}
          aria-pressed={selectedGame === 'spin'}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${selectedGame === 'spin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <RotateCw size={16} />
          Lucky spin
        </button>
        <button
          type="button"
          onClick={() => setSelectedGame('rps')}
          aria-pressed={selectedGame === 'rps'}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${selectedGame === 'rps' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Swords size={16} />
          Rock, Paper, Scissors
        </button>
      </div>

      <div hidden={selectedGame !== 'spin'}>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => spinQuery.refetch()}
          disabled={spinQuery.isFetching || Boolean(busySource)}
          aria-label="Refresh spin eligibility"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {spinQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
          Refresh eligibility
        </button>
      </div>

      {spinQuery.isPending && address && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-card p-3 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Checking your available claims and completed tasks…
        </div>
      )}
      {spinQuery.isError && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/20 bg-danger-bg p-3 text-sm text-danger">
          {spinQuery.error instanceof Error ? spinQuery.error.message : 'Could not load your spin status.'}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/20 bg-danger-bg p-3 text-sm text-danger">{error}</p>
      )}
      {notice && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success-bg p-3 text-sm text-success">
          <CheckCircle2 size={16} />
          {notice}
        </p>
      )}
      {spinStatus && !spinStatus.treasuryConfigured && (
        <p role="alert" className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
          The reward wallet is not configured yet, so spins are temporarily unavailable.
        </p>
      )}

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(290px,0.8fr)]">
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <div className="grid items-center gap-4 xl:grid-cols-[minmax(290px,1fr)_minmax(220px,0.66fr)]">
            <div className="flex justify-center px-4 pb-5 pt-3 sm:px-7">
              <Wheel outcomes={outcomes} rotation={rotation} />
            </div>

            <div className="rounded-2xl border border-line bg-background p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your spins</span>
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-accent px-2 font-mono text-sm font-bold text-accent-foreground">
                  {spinStatus?.availableSpins.length ?? 0}
                </span>
              </div>

              {lastOutcome && (
                <div className="mt-3 rounded-xl border border-line bg-card p-3 text-center">
                  <p className="font-display text-xl font-bold text-foreground">{lastOutcome}</p>
                </div>
              )}

              <button
                type="button"
                onClick={playSpin}
                disabled={!canPlay}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busySource ? <Loader2 size={18} className="animate-spin" /> : <RotateCw size={18} />}
                {busySource ? 'GOOD LUCK…' : 'SPIN NOW'}
              </button>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Claim UBI or finish tasks to earn spins.
              </p>
              {spinStatus && remainingToday < 200 && (
                <p className="mt-2 text-xs font-medium text-muted-foreground">Today’s reward budget is full.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Gift size={19} className="text-primary" />
            <h3 className="font-display text-lg font-bold">Earn spins</h3>
          </div>
          <div className="divide-y divide-line">
            <div className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <HandCoins size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">UBI claim bonus</p>
                <p className="text-xs text-muted-foreground">1 free spin after a verified UBI claim</p>
              </div>
              {ubiSpins.length > 0 && <CheckCircle2 size={17} className="text-success" aria-label="UBI claim verified" />}
            </div>
            <div className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-background">
                <BadgeCheck size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Approved tasks</p>
                <p className="text-xs text-muted-foreground">+1 spin per task</p>
              </div>
              {taskSpins.length > 0 && (
                <span className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-bold text-success">{taskSpins.length} ready</span>
              )}
            </div>
          </div>
          <Link
            href="/tasks"
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-background text-sm font-bold transition-colors hover:bg-muted"
          >
            Browse tasks
            <ArrowRight size={15} />
          </Link>
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-xs leading-5 text-muted-foreground">
            <Sparkles size={15} className="mt-0.5 shrink-0" />
            Verified users only. Rewards go to your connected wallet.
          </p>
        </section>
      </div>
      </div>
      {selectedGame === 'rps' && <RockPaperScissorsGame />}
    </div>
  );
}
