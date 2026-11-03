'use client';

import { useState } from 'react';
import { formatUnits, getAddress, isAddress, type Hex } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { Check, ExternalLink, Loader2, Shield, UserPlus, Wallet, X } from 'lucide-react';
import { useTaskSignature } from '@/hooks/useTaskSignature';
import { MAIN_ADMIN_WALLET } from '@/lib/admin';
import { CAMPAIGN_ESCROW_ABI } from '@/lib/campaignChain';
import { TASK_ESCROW_ABI } from '@/lib/taskChain';

const TASK_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_TASK_ESCROW_ADDRESS as `0x${string}` | undefined;
const CAMPAIGN_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS as `0x${string}` | undefined;

interface TaskReview {
  id: string;
  worker_address: string;
  proof_text: string;
  proof_url: string;
  proof_image_url: string;
  task: {
    id: string;
    escrow_task_id: Hex;
    title: string;
    requirements: string;
    reward_per_completion: string;
  };
}

interface CampaignReview {
  id: string;
  campaign_id: string;
  participant_address: string;
  application_text: string;
  campaign: {
    id: string;
    escrow_campaign_id: Hex;
    title: string;
    requirements: string;
    reward_per_participant: string;
  };
}

interface ContentReview {
  id: string;
  content_url: string;
  application: CampaignReview;
  campaign: CampaignReview['campaign'];
}

interface AdminWallet {
  wallet_address: string;
  added_by: string;
  created_at: string;
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Request failed.', response.status);
  return data as T;
}

export default function AdminPage() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const signTaskRequest = useTaskSignature();

  const [authorized, setAuthorized] = useState(false);
  const [denied, setDenied] = useState(false);
  const [taskReviews, setTaskReviews] = useState<TaskReview[]>([]);
  const [applicationReviews, setApplicationReviews] = useState<CampaignReview[]>([]);
  const [contentReviews, setContentReviews] = useState<ContentReview[]>([]);
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [newWallet, setNewWallet] = useState('');
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [applicationNotes, setApplicationNotes] = useState<Record<string, string>>({});
  const [contentNotes, setContentNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isMainAdmin = address?.toLowerCase() === MAIN_ADMIN_WALLET.toLowerCase();
  const inputClass = 'w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/40';
  const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40';
  const outlineButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-40';

  const ensureCelo = async () => {
    if (chainId !== 42220) await switchChainAsync({ chainId: 42220 });
  };

  const loadReviewQueues = async () => {
    setError('');
    setNotice('');
    setBusy('Verifying admin wallet and loading approval queues…');
    try {
      const taskPayload = {};
      const taskAuth = await signTaskRequest('POST', '/api/tasks/review-queue', taskPayload);
      const queues = await responseJson<{
        tasks: TaskReview[];
        applications: CampaignReview[];
        content: ContentReview[];
        wallets: AdminWallet[];
      }>(await fetch('/api/tasks/review-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth: taskAuth }),
      }));

      setTaskReviews(queues.tasks);
      setApplicationReviews(queues.applications);
      setContentReviews(queues.content);
      setWallets(queues.wallets);
      setAuthorized(true);
      setDenied(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setDenied(true);
        setAuthorized(false);
      }
      setError(err instanceof Error ? err.message : 'Could not load approval queues.');
    } finally {
      setBusy('');
    }
  };

  const adminWalletRequest = async <T,>(action: 'list' | 'add' | 'remove', walletAddress?: string): Promise<T> => {
    const payload = walletAddress ? { action, walletAddress } : { action };
    const auth = await signTaskRequest('POST', '/api/admin/wallets', payload);
    return responseJson<T>(await fetch('/api/admin/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, auth }),
    }));
  };

  const loadWallets = async () => {
    setError('');
    try {
      setWallets(await adminWalletRequest<AdminWallet[]>('list'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin wallets.');
    }
  };

  const changeAdminWallet = async (action: 'add' | 'remove', walletAddress: string) => {
    if (!isMainAdmin || !publicClient || !address) return;
    if (!isAddress(walletAddress)) {
      setError('Enter a valid wallet address.');
      return;
    }
    if (!TASK_ESCROW_ADDRESS || !CAMPAIGN_ESCROW_ADDRESS) {
      setError('Both task and campaign escrow addresses must be configured before changing admin access.');
      return;
    }

    const normalizedAddress = getAddress(walletAddress);
    const enabled = action === 'add';
    setError('');
    setNotice('');
    setBusy(`${enabled ? 'Granting' : 'Revoking'} reviewer access on Celo…`);
    try {
      await ensureCelo();
      const taskHash = await writeContractAsync({
        address: TASK_ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        functionName: 'setAdmin',
        args: [normalizedAddress, enabled],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: taskHash });

      const campaignHash = await writeContractAsync({
        address: CAMPAIGN_ESCROW_ADDRESS,
        abi: CAMPAIGN_ESCROW_ABI,
        functionName: 'setAdmin',
        args: [normalizedAddress, enabled],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: campaignHash });

      await adminWalletRequest<{ walletAddress: string; action: string }>(action, normalizedAddress);
      setWallets((current) => enabled
        ? current.some((wallet) => wallet.wallet_address === normalizedAddress.toLowerCase())
          ? current
          : [...current, {
            wallet_address: normalizedAddress.toLowerCase(),
            added_by: address.toLowerCase(),
            created_at: new Date().toISOString(),
          }]
        : current.filter((wallet) => wallet.wallet_address !== normalizedAddress.toLowerCase()));
      setNewWallet('');
      setNotice(enabled ? 'Reviewer added to both escrow contracts and the admin allowlist.' : 'Reviewer removed from both escrow contracts and the admin allowlist.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reviewer access.');
    } finally {
      setBusy('');
    }
  };

  const reviewTask = async (submission: TaskReview, decision: 'approved' | 'rejected') => {
    if (!address || !publicClient || !TASK_ESCROW_ADDRESS) {
      setError('Task escrow is not configured.');
      return;
    }
    const reviewNote = (taskNotes[submission.id] || '').trim();
    if (decision === 'rejected' && !reviewNote) {
      setError('Add a reason when rejecting a task submission.');
      return;
    }

    setError('');
    setNotice('');
    setBusy(decision === 'approved' ? 'Approving task submission…' : 'Rejecting task submission…');
    try {
      await ensureCelo();
      const transactionHash = await writeContractAsync({
        address: TASK_ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        functionName: decision === 'approved' ? 'approveSubmission' : 'rejectSubmission',
        args: [submission.task.escrow_task_id, submission.worker_address as `0x${string}`],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash, pollingInterval: 1000 });

      const payload = { submissionId: submission.id, decision, reviewNote, transactionHash };
      const auth = await signTaskRequest('POST', '/api/tasks/reviews', payload);
      await responseJson(await fetch('/api/tasks/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, auth }),
      }));
      setNotice(decision === 'approved' ? 'Task submission approved and reward released.' : 'Task submission rejected.');
      setTaskReviews((current) => current.filter((item) => item.id !== submission.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review this task submission.');
    } finally {
      setBusy('');
    }
  };

  const reviewApplication = async (application: CampaignReview, decision: 'approved' | 'rejected') => {
    if (!address || !publicClient || !CAMPAIGN_ESCROW_ADDRESS) {
      setError('Campaign escrow is not configured.');
      return;
    }
    const reviewNote = (applicationNotes[application.id] || '').trim();
    if (decision === 'rejected' && !reviewNote) {
      setError('Add a reason when rejecting an application.');
      return;
    }

    setError('');
    setNotice('');
    setBusy(decision === 'approved' ? 'Approving campaign participant…' : 'Rejecting campaign application…');
    try {
      const payload = { applicationId: application.id, decision, reviewNote };
      const auth = await signTaskRequest('POST', '/api/campaigns/applications/review', payload);
      let transactionHash: Hex | null = null;
      if (decision === 'approved') {
        await ensureCelo();
        transactionHash = await writeContractAsync({
          address: CAMPAIGN_ESCROW_ADDRESS,
          abi: CAMPAIGN_ESCROW_ABI,
          functionName: 'approveParticipant',
          args: [application.campaign.escrow_campaign_id, application.participant_address as `0x${string}`],
          chainId: 42220,
        });
        await publicClient.waitForTransactionReceipt({ hash: transactionHash, pollingInterval: 1000 });
      }
      await responseJson(await fetch('/api/campaigns/applications/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, transactionHash, auth }),
      }));
      setNotice(decision === 'approved' ? 'Campaign participant approved.' : 'Campaign application rejected.');
      setApplicationReviews((current) => current.filter((item) => item.id !== application.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review this campaign application.');
    } finally {
      setBusy('');
    }
  };

  const reviewContent = async (item: ContentReview, decision: 'approved' | 'rejected') => {
    if (!address || !publicClient || !CAMPAIGN_ESCROW_ADDRESS) {
      setError('Campaign escrow is not configured.');
      return;
    }
    const reviewNote = (contentNotes[item.id] || '').trim();
    if (decision === 'rejected' && !reviewNote) {
      setError('Add a reason when rejecting campaign content.');
      return;
    }

    setError('');
    setNotice('');
    setBusy(decision === 'approved' ? 'Approving content and releasing reward…' : 'Rejecting campaign content…');
    try {
      const payload = { contentId: item.id, decision, reviewNote };
      const auth = await signTaskRequest('POST', '/api/campaigns/content/review', payload);
      let transactionHash: Hex | null = null;
      if (decision === 'approved') {
        await ensureCelo();
        transactionHash = await writeContractAsync({
          address: CAMPAIGN_ESCROW_ADDRESS,
          abi: CAMPAIGN_ESCROW_ABI,
          functionName: 'payParticipant',
          args: [item.campaign.escrow_campaign_id, item.application.participant_address as `0x${string}`],
          chainId: 42220,
        });
        await publicClient.waitForTransactionReceipt({ hash: transactionHash, pollingInterval: 1000 });
      }
      await responseJson(await fetch('/api/campaigns/content/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, transactionHash, auth }),
      }));
      setNotice(decision === 'approved' ? 'Campaign content approved and reward released.' : 'Campaign content rejected.');
      setContentReviews((current) => current.filter((review) => review.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review this campaign content.');
    } finally {
      setBusy('');
    }
  };

  if (!address) {
    return <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted-foreground">Connect an admin wallet to continue.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Restricted wallet access</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
            <Shield size={25} /> Admin approvals
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Review task proof, campaign applications, and campaign content in one place.</p>
        </div>
        <button type="button" onClick={loadReviewQueues} disabled={!!busy} className={primaryButton}>
          <Loader2 size={15} className={busy ? 'animate-spin' : 'hidden'} />
          {busy ? 'Working…' : 'Load / refresh approvals'}
        </button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
      {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">{busy}</p>}
      {denied && (
        <section className="mt-6 rounded-xl border border-line bg-card p-5">
          <h2 className="font-semibold">Admin access required</h2>
          <p className="mt-1 text-sm text-muted-foreground">This connected wallet is not authorized to view approval queues. Only the main admin or an allowlisted wallet can continue.</p>
        </section>
      )}

      {authorized && (
        <>
          {isMainAdmin && (
            <section className="mt-8 rounded-2xl border border-line bg-card p-6">
              <div>
                <h2 className="font-display text-xl font-bold">Reviewer wallets</h2>
                <p className="mt-1 text-sm text-muted-foreground">The main admin wallet is the only wallet that can manage reviewers. Changes update both escrow contracts and the server allowlist.</p>
              </div>
              <form
                className="mt-4 flex flex-wrap gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void changeAdminWallet('add', newWallet);
                }}
              >
                <input
                  required
                  value={newWallet}
                  onChange={(event) => setNewWallet(event.target.value)}
                  placeholder="0x reviewer wallet address"
                  className={`${inputClass} min-w-64 flex-1`}
                />
                <button type="submit" disabled={!!busy || !newWallet.trim()} className={primaryButton}>
                  <UserPlus size={15} /> Add reviewer
                </button>
                <button type="button" onClick={() => void loadWallets()} disabled={!!busy} className={outlineButton}>
                  Refresh list
                </button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground">
                Main admin: <span className="font-mono">{MAIN_ADMIN_WALLET}</span>
              </p>
              {wallets.length > 0 && (
                <div className="mt-4 divide-y divide-line rounded-xl border border-line">
                  {wallets.map((wallet) => (
                    <div key={wallet.wallet_address} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <span className="break-all font-mono text-xs">{wallet.wallet_address}</span>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => void changeAdminWallet('remove', wallet.wallet_address)}
                        className={outlineButton}
                      >
                        <X size={14} /> Revoke access
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {wallets.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No additional reviewer wallets are allowlisted.</p>}
            </section>
          )}

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Task submissions ({taskReviews.length})</h2>
            {taskReviews.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No task submissions need review.</p> : (
              <div className="mt-4 grid gap-4">
                {taskReviews.map((submission) => (
                  <article key={submission.id} className="rounded-2xl border border-line bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg font-bold">{submission.task.title}</h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">Worker: {submission.worker_address}</p>
                      </div>
                      <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold text-accent-foreground">
                        {formatUnits(BigInt(submission.task.reward_per_completion), 18)} G$
                      </span>
                    </div>
                    <p className="mt-3 text-sm"><strong>Requirements:</strong> {submission.task.requirements}</p>
                    {submission.proof_text && <p className="mt-3 whitespace-pre-wrap text-sm">{submission.proof_text}</p>}
                    {submission.proof_url && (
                      <a href={submission.proof_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
                        Open proof link <ExternalLink size={13} />
                      </a>
                    )}
                    {submission.proof_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={submission.proof_image_url} alt="Submitted task proof" className="mt-3 max-h-80 rounded-xl border border-line object-contain" />
                    )}
                    <textarea
                      value={taskNotes[submission.id] || ''}
                      onChange={(event) => setTaskNotes((current) => ({ ...current, [submission.id]: event.target.value }))}
                      maxLength={1000}
                      placeholder="Reviewer note (required when rejecting)"
                      className={`${inputClass} mt-3 min-h-16`}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={!!busy} onClick={() => void reviewTask(submission, 'approved')} className={primaryButton}>
                        <Check size={15} /> Approve and pay
                      </button>
                      <button type="button" disabled={!!busy || !(taskNotes[submission.id] || '').trim()} onClick={() => void reviewTask(submission, 'rejected')} className={outlineButton}>
                        Reject proof
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Campaign applications ({applicationReviews.length})</h2>
            {applicationReviews.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No applications need review.</p> : (
              <div className="mt-4 grid gap-4">
                {applicationReviews.map((application) => (
                  <article key={application.id} className="rounded-2xl border border-line bg-card p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg font-bold">{application.campaign.title}</h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{application.participant_address}</p>
                      </div>
                      <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold text-accent-foreground">
                        {formatUnits(BigInt(application.campaign.reward_per_participant), 18)} G$
                      </span>
                    </div>
                    <p className="mt-3 text-sm"><strong>Requirements:</strong> {application.campaign.requirements}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{application.application_text}</p>
                    <textarea
                      value={applicationNotes[application.id] || ''}
                      onChange={(event) => setApplicationNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                      maxLength={1000}
                      placeholder="Review note (required when rejecting)"
                      className={`${inputClass} mt-3 min-h-16`}
                    />
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={!!busy} onClick={() => void reviewApplication(application, 'approved')} className={primaryButton}>
                        <Check size={15} /> Approve participant
                      </button>
                      <button type="button" disabled={!!busy || !(applicationNotes[application.id] || '').trim()} onClick={() => void reviewApplication(application, 'rejected')} className={outlineButton}>
                        Reject application
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Campaign content ({contentReviews.length})</h2>
            {contentReviews.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No campaign content needs review.</p> : (
              <div className="mt-4 grid gap-4">
                {contentReviews.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-line bg-card p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg font-bold">{item.campaign.title}</h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{item.application.participant_address}</p>
                      </div>
                      <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold text-accent-foreground">
                        {formatUnits(BigInt(item.campaign.reward_per_participant), 18)} G$
                      </span>
                    </div>
                    <p className="mt-3 text-sm"><strong>Requirements:</strong> {item.campaign.requirements}</p>
                    <a href={item.content_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
                      Open submitted content <ExternalLink size={13} />
                    </a>
                    <textarea
                      value={contentNotes[item.id] || ''}
                      onChange={(event) => setContentNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      maxLength={1000}
                      placeholder="Review note (required when rejecting)"
                      className={`${inputClass} mt-3 min-h-16`}
                    />
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={!!busy} onClick={() => void reviewContent(item, 'approved')} className={primaryButton}>
                        <Wallet size={15} /> Approve and pay
                      </button>
                      <button type="button" disabled={!!busy || !(contentNotes[item.id] || '').trim()} onClick={() => void reviewContent(item, 'rejected')} className={outlineButton}>
                        Reject content
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
