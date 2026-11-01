'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check, MessageSquare, Heart, ArrowRight, ArrowUpRight, Loader2, X } from 'lucide-react';
import { isAddress, parseUnits } from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
import { useCreator } from '@/providers/CreatorProvider';
import { useGDollarBalance } from '@/hooks/useGDollarBalance';
import { ERC20_ABI, G_DOLLAR_ADDRESS } from '@/lib/contracts';

export default function DashboardHome() {
  const { creator, tips, sentTips, tipStats, walletAddress } = useCreator();
  const { balance: gBalance, isLoading: balanceLoading } = useGDollarBalance(walletAddress || undefined);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [copied, setCopied] = useState(false);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'received' | 'sent'>('received');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawTxHash, setWithdrawTxHash] = useState<`0x${string}` | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tipLink = `${origin}/tip/${creator.username || 'username'}`;

  const copyLink = () => {
    navigator.clipboard.writeText(tipLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const avgTip = tipStats.receivedCount > 0
    ? Math.round(tipStats.totalReceived / tipStats.receivedCount)
    : 0;

  const balanceDisplay = balanceLoading && gBalance == null
    ? '…'
    : gBalance != null
      ? gBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : '—';

  const stats = [
    { label: 'Wallet balance', value: balanceDisplay, suffix: 'G$', live: true },
    { label: 'Total received', value: tipStats.totalReceived.toLocaleString(), suffix: 'G$' },
    { label: 'Total tipped', value: tipStats.totalTipped.toLocaleString(), suffix: 'G$' },
    { label: 'Average tip', value: String(avgTip), suffix: 'G$' },
  ];

  const handleSetMax = () => {
    if (gBalance == null || gBalance <= 0) return;
    setAmount(String(gBalance));
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawTxHash(null);

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

    try {
      setIsSending(true);
      const parsedAmount = parseUnits(amount, 18);
      const txHash = await walletClient.writeContract({
        address: G_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parsedAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setWithdrawTxHash(txHash);
      setAmount('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      setWithdrawError(msg.includes('User rejected') ? 'Transaction rejected.' : 'Transfer failed. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl animate-fade-up flex-col gap-6">
      {/* Greeting + tip link */}
      <div className="flex items-end justify-between gap-6 max-md:flex-col max-md:items-stretch">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {creator.name ? `Hello, ${creator.name.split(' ')[0]}` : 'Welcome'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your earnings at a glance.
          </p>
        </div>

        <div className="flex h-10 max-w-md flex-1 items-center gap-1 rounded-xl border border-line bg-card pl-3.5 pr-1 max-md:max-w-none">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {creator.username ? tipLink : 'Set a username to activate your link'}
          </span>
          <button
            onClick={copyLink}
            disabled={!creator.username}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => setWithdrawOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-sm font-semibold transition-colors hover:border-foreground/30"
        >
          Withdraw
          <ArrowUpRight size={14} />
        </button>
      </div>

      {/* Onboarding nudge */}
      {!creator.username && (
        <Link
          href="/settings"
          className="flex items-center justify-between gap-4 rounded-xl border border-line bg-accent/15 px-5 py-4 transition-colors hover:bg-accent/25"
        >
          <div>
            <p className="text-sm font-semibold">Claim your username to start receiving tips</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Register your handle on-chain and set up your public page in Settings.
            </p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              {s.live && (
                <span className="flex items-center gap-1 rounded-full bg-success-bg px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-success">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-success" />
                  Live
                </span>
              )}
            </div>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight">
              {s.value}
              {s.suffix && <span className="ml-1 text-sm font-medium text-muted-foreground">{s.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Tips ledger */}
      <section className="rounded-xl border border-line bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-2.5">
          <MessageSquare size={17} className="text-muted-foreground" />
          <h3 className="font-display text-[15px] font-semibold">Tip history</h3>
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
                View tx: {withdrawTxHash.slice(0, 10)}…
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
