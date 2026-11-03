'use client';

import { useState } from 'react';
import { ArrowRight, Check, ExternalLink, Loader2, BadgeCheck, Wallet } from 'lucide-react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSendTip } from '@/hooks/useSendTip';
import { useGDollarBalance } from '@/hooks/useGDollarBalance';
import type { Creator, Tip } from '@/providers/CreatorProvider';

interface TipPageViewProps {
  creatorInfo: Creator;
  onAddTip?: (tip: Tip) => void;
  isWidget?: boolean;
}

export default function TipPageView({ creatorInfo, onAddTip, isWidget = false }: TipPageViewProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [senderName, setSenderName] = useState('');

  const { sendTip, status, txHash, error: tipError, reset: resetTip } = useSendTip();
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const senderWallet = (wallets[0]?.address ?? '') as `0x${string}` | '';
  const { balance: walletBalance, isLoading: balanceLoading } = useGDollarBalance(senderWallet || undefined);

  const isSending = status === 'approving' || status === 'approved' || status === 'sending';
  const isSuccess = status === 'success';

  const sendingLabel =
    status === 'approving' ? 'Approving G$…' :
    status === 'approved'  ? 'Approval confirmed…' :
    'Sending tip…';

  const activeAmount = parseFloat(customAmount) || 0;

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setCustomAmount(value);
    }
  };

  const handleSetMax = () => {
    if (walletBalance == null || walletBalance <= 0) return;
    setCustomAmount(String(walletBalance));
  };

  const handleSubmitTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeAmount <= 0) return;

    const result = await sendTip({
      creatorUsername: creatorInfo.username,
      amountG$: activeAmount,
      message: message.trim() || '',
    });

    if (result && onAddTip) {
      onAddTip({
        creator_username: creatorInfo.username,
        sender_name: senderName.trim() || 'Anonymous Fan',
        sender_address: result.senderAddress,
        amount: activeAmount,
        message: message.trim() || 'Supported the creator!',
        tx_hash: result.txHash,
      });
    }
  };

  const resetForm = () => {
    resetTip();
    setMessage('');
    setSenderName('');
    setCustomAmount('');
  };

  const inputClass =
    'w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-foreground/40 outline-none';

  return (
    <div className={`w-full ${isWidget ? '' : 'max-w-md'}`}>
      {!isSuccess ? (
        <div className="animate-fade-up rounded-2xl border border-line bg-card p-7 shadow-sm">
          {/* Creator header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-display text-2xl font-bold text-accent-foreground">
              {creatorInfo.name ? creatorInfo.name.charAt(0).toUpperCase() : 'C'}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <h2 className="font-display text-xl font-bold tracking-tight">
                {creatorInfo.name || 'Creator'}
              </h2>
              <BadgeCheck size={16} className="text-success" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">@{creatorInfo.username || 'username'}</p>
            {creatorInfo.bio && (
              <p className="mt-2.5 line-clamp-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                {creatorInfo.bio}
              </p>
            )}
            {creatorInfo.wallet_address && (
              <span className="mt-3 rounded-full border border-line bg-muted px-3 py-1 font-mono text-[11px] text-muted-foreground">
                {creatorInfo.wallet_address.slice(0, 6)}…{creatorInfo.wallet_address.slice(-4)}
              </span>
            )}
          </div>

          {/* Tip form */}
          <form onSubmit={handleSubmitTip} className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">Amount (G$)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter amount"
                  value={customAmount}
                  onChange={handleCustomAmountChange}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={handleSetMax}
                  disabled={!authenticated || walletBalance == null || walletBalance <= 0}
                  className="h-10 rounded-lg border border-line bg-card px-3 text-xs font-semibold transition-colors hover:border-foreground/30 disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Your balance:{' '}
                {balanceLoading
                  ? 'Loading...'
                  : walletBalance != null
                    ? `${walletBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} G$`
                    : 'Connect wallet to view'}
              </p>
            </div>

            <input
              type="text"
              placeholder="Your name (optional)"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className={inputClass}
            />

            <textarea
              placeholder="Add a message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={150}
              className={`${inputClass} min-h-20 resize-y`}
            />

            {tipError && (
              <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-center text-xs font-medium text-danger">
                {tipError}
              </p>
            )}

            {authenticated ? (
              <button
                type="submit"
                disabled={activeAmount <= 0 || isSending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isSending ? (
                  <><Loader2 size={16} className="animate-spin" />{sendingLabel}</>
                ) : (
                  <>Send {activeAmount > 0 ? `${activeAmount} G$` : 'tip'}<ArrowRight size={16} /></>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={login}
                disabled={!ready}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Wallet size={16} />
                Connect wallet to tip
              </button>
            )}
          </form>
        </div>
      ) : (
        /* Success state */
        <div className="animate-fade-up rounded-2xl border border-line bg-card p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-bg">
            <Check size={28} className="text-success" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">Tip sent!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeAmount} G$ is on its way to {creatorInfo.name || 'the creator'}.
          </p>

          <div className="mt-5 rounded-xl border border-line bg-muted/50 p-4 text-left text-sm">
            <div className="flex justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Recipient</span>
              <span className="font-semibold">{creatorInfo.name}</span>
            </div>
            <div className="flex justify-between border-t border-line py-1.5">
              <span className="text-xs text-muted-foreground">Amount</span>
              <span className="font-mono font-bold">{activeAmount} G$</span>
            </div>
            {message && (
              <div className="border-t border-line py-1.5">
                <span className="text-xs text-muted-foreground">Message</span>
                <p className="mt-0.5 text-[13px] italic">&quot;{message}&quot;</p>
              </div>
            )}
          </div>

          {txHash && (
            <a
              href={`https://celoscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink size={12} />
              View on Celoscan
            </a>
          )}

          <button
            onClick={resetForm}
            className="mt-5 w-full rounded-xl border border-line py-2.5 text-sm font-semibold transition-colors hover:border-foreground/30"
          >
            Send another tip
          </button>
        </div>
      )}
    </div>
  );
}
