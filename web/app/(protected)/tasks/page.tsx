'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatUnits, keccak256, maxUint256, parseUnits, stringToHex, type Hex } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Upload, Wallet } from 'lucide-react';
import { useTaskSignature } from '@/hooks/useTaskSignature';
import { ERC20_ABI, G_DOLLAR_ADDRESS } from '@/lib/contracts';
import { TASK_ESCROW_ABI } from '@/lib/taskChain';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import { getWalletActionErrorMessage } from '@/lib/walletErrors';
import { notifyActivityChanged } from '@/lib/notificationState';

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_TASK_ESCROW_ADDRESS as `0x${string}` | undefined;

interface Task {
  id: string;
  escrow_task_id: Hex;
  creator_address: string;
  title: string;
  description: string;
  requirements: string;
  reward_per_completion: string;
  slots: number;
  total_slots: number;
  claimed_slots: number;
  duration_days: number | null;
  expires_at: string | null;
  created_at: string;
  status: string;
}

interface MySubmission {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  task: Pick<Task, 'id' | 'title' | 'reward_per_completion' | 'status' | 'expires_at'>;
}

interface MyTasksResult {
  submissions: MySubmission[];
  createdTasks: Task[];
}

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function TasksPage() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: 42220 });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const signTaskRequest = useTaskSignature();

  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [reward, setReward] = useState('');
  const [slots, setSlots] = useState('1');
  const [durationDays, setDurationDays] = useState('7');
  const [activeView, setActiveView] = useState<'explore' | 'mine'>('explore');
  const [proofTask, setProofTask] = useState<Task | null>(null);
  const [proofText, setProofText] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [myCreatedTasks, setMyCreatedTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [myTasksLoaded, setMyTasksLoaded] = useState(false);

  const tasksQuery = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => responseJson(await fetch('/api/tasks')),
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const loadTasks = async () => { await tasksQuery.refetch(); };

  const gasEstimateQuery = useQuery({
    queryKey: ['task-reservation-gas', proofTask?.id, address],
    enabled: Boolean(proofTask && address && publicClient && ESCROW_ADDRESS),
    queryFn: async () => {
      if (!proofTask || !address || !publicClient || !ESCROW_ADDRESS) {
        throw new Error('Connect a wallet to estimate the Celo transaction fee.');
      }
      try {
        const [submissionState, balance] = await Promise.all([
          publicClient.readContract({
            address: ESCROW_ADDRESS,
            abi: TASK_ESCROW_ABI,
            functionName: 'submissionState',
            args: [proofTask.escrow_task_id, address],
          }),
          publicClient.getBalance({ address }),
        ]);
        if (submissionState === 1) {
          return { fee: '0', balance: balance.toString(), alreadyReserved: true };
        }
        if (submissionState === 2) {
          throw new Error('This task is already completed by your wallet.');
        }
        const [gasLimit, gasPrice] = await Promise.all([
          publicClient.estimateContractGas({
            address: ESCROW_ADDRESS,
            abi: TASK_ESCROW_ABI,
            functionName: 'reserveSubmission',
            args: [proofTask.escrow_task_id],
            account: address,
          }),
          publicClient.getGasPrice(),
        ]);
        const fee = gasLimit * gasPrice;
        return {
          fee: fee.toString(),
          balance: balance.toString(),
          alreadyReserved: false,
        };
      } catch (estimateError) {
        console.error('Task reservation fee estimate failed:', estimateError);
        if (estimateError instanceof Error && estimateError.message === 'This task is already completed by your wallet.') {
          throw estimateError;
        }
        throw new Error('Fee estimate is unavailable. Check your Celo connection and retry.');
      }
    },
  });

  const loadMyTasks = useCallback(async () => {
    if (!address) {
      setMySubmissions([]);
      setMyCreatedTasks([]);
      return;
    }
    const result = await responseJson(await fetch(
      `/api/tasks/my-submissions?wallet=${encodeURIComponent(address)}`,
      { cache: 'no-store' },
    )) as MyTasksResult;
    setMySubmissions(result.submissions);
    setMyCreatedTasks(result.createdTasks);
    setMyTasksLoaded(true);
  }, [address]);

  useEffect(() => {
    const syncHashView = () => {
      if (window.location.hash === '#my-tasks') {
        setActiveView('mine');
        void loadMyTasks().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your tasks.'));
      } else if (window.location.hash === '#explore-tasks') {
        setActiveView('explore');
      }
    };
    const frame = window.requestAnimationFrame(syncHashView);
    window.addEventListener('hashchange', syncHashView);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', syncHashView);
    };
  }, [loadMyTasks]);

  useEffect(() => {
    if (!tasksQuery.data || !window.location.hash.startsWith('#task-')) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tasksQuery.data]);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === 'open'), [tasks]);

  const ensureCelo = async () => {
    if (chainId !== 42220) {
      await switchChainAsync({ chainId: 42220 });
    }
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !publicClient || !ESCROW_ADDRESS) {
      setError(!ESCROW_ADDRESS ? 'Task escrow is not configured. Deploy TaskEscrow and set NEXT_PUBLIC_TASK_ESCROW_ADDRESS.' : 'Connect MetaMask first.');
      return;
    }
    const completionSlots = Number(slots);
    if (!Number.isInteger(completionSlots) || completionSlots < 1 || completionSlots > 1000) {
      setError('Choose between 1 and 1,000 completion slots.');
      return;
    }
    const taskDurationDays = Number(durationDays);
    if (!Number.isInteger(taskDurationDays) || taskDurationDays < 1 || taskDurationDays > 365) {
      setError('Choose a task duration between 1 and 365 days.');
      return;
    }
    let rewardUnits: bigint;
    try {
      rewardUnits = parseUnits(reward, 18);
    } catch {
      setError('Enter a valid G$ reward amount.');
      return;
    }
    if (rewardUnits <= BigInt(0)) {
      setError('The reward must be greater than zero.');
      return;
    }

    setError('');
    setNotice('');
    setBusy('Creating and funding task…');
    try {
      await ensureCelo();
      const taskUuid = crypto.randomUUID();
      const escrowTaskId = keccak256(stringToHex(taskUuid));
      const totalFunding = rewardUnits * BigInt(completionSlots);
      const allowance = await publicClient.readContract({
        address: G_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ESCROW_ADDRESS],
      });
      if (allowance < totalFunding) {
        const approvalHash = await writeContractAsync({
          address: G_DOLLAR_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_ADDRESS, maxUint256],
          chainId: 42220,
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      const transactionHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        functionName: 'createTask',
        args: [escrowTaskId, rewardUnits, completionSlots],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });

      const payload = {
        id: taskUuid,
        escrowTaskId,
        title: title.trim(),
        description: description.trim(),
        requirements: requirements.trim(),
        rewardPerCompletion: rewardUnits.toString(),
        slots: completionSlots,
        durationDays: taskDurationDays,
        transactionHash,
      };
      const auth = await signTaskRequest('POST', '/api/tasks', payload);
      const savedTask = await responseJson(await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, auth }),
      })) as Task;

      setTitle('');
      setDescription('');
      setRequirements('');
      setReward('');
      setSlots('1');
      setDurationDays('7');
      setMyCreatedTasks((current) => [{
        ...savedTask,
        total_slots: completionSlots,
        claimed_slots: 0,
      }, ...current]);
      setNotice('Task created and G$ rewards escrowed.');
      await loadTasks();
    } catch (err) {
      setError(getWalletActionErrorMessage(err, 'task creation'));
    } finally {
      setBusy('');
    }
  };

  const closeTask = async (task: Task) => {
    if (!address || !publicClient || !ESCROW_ADDRESS) return;
    if (!window.confirm('Close this task and refund rewards for unreserved slots? Pending submissions will remain payable.')) return;
    setError('');
    setNotice('');
    setBusy('Closing task…');
    try {
      await ensureCelo();
      const transactionHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        functionName: 'closeTask',
        args: [task.escrow_task_id],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });

      const payload = { taskId: task.id, transactionHash };
      const auth = await signTaskRequest('POST', '/api/tasks/close', payload);
      await responseJson(await fetch('/api/tasks/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, auth }),
      }));
      setMyCreatedTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: 'closed' } : item));
      setNotice('Task closed. Rewards for unreserved slots were refunded.');
      await loadTasks();
    } catch (err) {
      setError(getWalletActionErrorMessage(err, 'task closure'));
    } finally {
      setBusy('');
    }
  };

  const uploadScreenshot = async (task: Task, file: File) => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const payload = {
      taskId: task.id,
      fileName: file.name.slice(-120),
      contentType: file.type,
      sha256,
    };
    const auth = await signTaskRequest('POST', '/api/tasks/proof-upload', payload);
    const form = new FormData();
    form.set('taskId', task.id);
    form.set('file', file);
    form.set('address', auth.address);
    form.set('nonce', auth.nonce);
    form.set('issuedAt', auth.issuedAt);
    form.set('signature', auth.signature);
    const result = await responseJson(await fetch('/api/tasks/proof-upload', { method: 'POST', body: form }));
    return result.path as string;
  };

  const submitProof = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!proofTask || !address || !publicClient || !ESCROW_ADDRESS) return;
    if (!proofText.trim() && !proofUrl.trim() && !proofFile) {
      setError('Add proof text, a link, or a screenshot.');
      return;
    }

    setError('');
    setNotice('');
    setBusy('Preparing proof…');
    try {
      await ensureCelo();
      await responseJson(await fetch(`/api/tasks?taskId=${encodeURIComponent(proofTask.id)}`));
      const submissionState = await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        functionName: 'submissionState',
        args: [proofTask.escrow_task_id, address],
      });
      if (submissionState === 2) {
        throw new Error('This task is already completed by your wallet.');
      }
      if (submissionState === 0 && gasEstimateQuery.data && !gasEstimateQuery.data.alreadyReserved) {
        const estimatedFee = BigInt(gasEstimateQuery.data.fee);
        const availableBalance = BigInt(gasEstimateQuery.data.balance);
        if (availableBalance < estimatedFee) {
          throw new Error('Your available CELO balance is below the current estimated transaction fee. Add CELO to your wallet before submitting.');
        }
      }
      const proofStoragePath = proofFile ? await uploadScreenshot(proofTask, proofFile) : '';
      const payload = {
        taskId: proofTask.id,
        proofText: proofText.trim(),
        proofUrl: proofUrl.trim(),
        proofStoragePath,
      };
      setBusy('Confirm the proof details in MetaMask…');
      const auth = await signTaskRequest('POST', '/api/tasks/submissions', payload);
      let reservationTxHash: Hex | '' = '';
      if (submissionState === 0) {
        setBusy('Confirm the reservation in MetaMask…');
        reservationTxHash = await writeContractAsync({
          address: ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: 'reserveSubmission',
          args: [proofTask.escrow_task_id],
          chainId: 42220,
        });
        setBusy('Waiting for Celo to confirm the reservation…');
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: reservationTxHash,
          pollingInterval: 1000,
        });
        if (receipt.status !== 'success') {
          throw new Error('The task reservation transaction failed on Celo.');
        }
      }

      setBusy('Saving proof for review…');
      const submissionPayload = { ...payload, reservationTxHash };
      const savedSubmission = await responseJson(await fetch('/api/tasks/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submissionPayload, auth }),
      }));
      notifyActivityChanged();

      setProofTask(null);
      setProofText('');
      setProofUrl('');
      setProofFile(null);
      setMySubmissions((current) => [{
        ...savedSubmission,
        task: {
          id: proofTask.id,
          title: proofTask.title,
          reward_per_completion: proofTask.reward_per_completion,
          status: proofTask.status,
          expires_at: proofTask.expires_at,
        },
      }, ...current]);
      setNotice('Proof submitted for admin review.');
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith('Your available CELO balance')
        ? err.message
        : getWalletActionErrorMessage(err, 'task submission'));
    } finally {
      setBusy('');
    }
  };

  const inputClass = 'w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/40';
  const buttonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40';

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Community rewards</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-2 text-sm text-muted-foreground">Fund tasks with G$, submit proof, and earn rewards after admin review.</p>
        </div>
      </div>

      <nav id="my-tasks" aria-label="Task views" className="mt-6 flex w-fit rounded-xl border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => { setActiveView('explore'); window.history.replaceState(null, '', '/tasks#explore-tasks'); }}
          aria-pressed={activeView === 'explore'}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${activeView === 'explore' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Explore tasks
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView('mine');
            window.history.replaceState(null, '', '/tasks#my-tasks');
            if (!myTasksLoaded) void loadMyTasks().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your tasks.'));
          }}
          aria-pressed={activeView === 'mine'}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${activeView === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          My tasks
        </button>
      </nav>

      {!ESCROW_ADDRESS && (
        <p role="alert" className="mt-5 rounded-xl border border-line bg-card p-4 text-sm">
          Task escrow is not deployed/configured. Set <code>NEXT_PUBLIC_TASK_ESCROW_ADDRESS</code> after deploying the escrow contract.
        </p>
      )}
      {tasksQuery.error && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-bg p-3 text-sm text-danger">
          {tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Could not load tasks.'}
        </p>
      )}
      {error && <p role="alert" className="mt-5 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
      {busy && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" />{busy}
        </p>
      )}

      {activeView === 'mine' && <section className="mt-8 rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-xl font-bold">Create a task</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set up the task, then choose its G$ reward budget. Fund every slot up front; admin reviewers release G$ after approving proof.</p>
        <form onSubmit={createTask} className="mt-5 grid gap-4 md:grid-cols-2">
          <fieldset className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <legend className="mb-3 text-sm font-bold">Task details</legend>
            <label className="text-sm font-medium">
              Task title
              <input required minLength={3} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Share a community post" className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium">
              Task description
              <textarea required maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what participants need to do" className={`${inputClass} mt-1 min-h-24`} />
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Proof requirements
              <textarea required maxLength={2000} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Explain what reviewers should look for when checking submissions" className={`${inputClass} mt-1 min-h-20`} />
            </label>
          </fieldset>
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:col-span-2 md:grid-cols-2">
            <legend className="px-1 text-sm font-bold">G$ reward budget</legend>
            <label className="text-sm font-medium">
              Reward per completion (G$)
              <input required inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. 25" className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium">
              Completion slots
              <input required type="number" min={1} max={1000} value={slots} onChange={(e) => setSlots(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium">
              Task duration (days)
              <input required type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">
              Total escrow funding is the reward per completion multiplied by the number of slots. The app requests a persistent, unlimited G$ allowance for this escrow once so later task funding usually needs one transaction. Revoke it from your wallet if you stop using the escrow.
            </p>
          </fieldset>
          <div className="flex justify-end md:col-span-2">
            <button type="submit" disabled={!!busy || !ESCROW_ADDRESS} className={buttonClass}>
              <Wallet size={15} /> Fund and publish task
            </button>
          </div>
        </form>
      </section>}

      {proofTask && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Submit proof: {proofTask.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{proofTask.requirements}</p>
            </div>
            <button type="button" onClick={() => setProofTask(null)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
          <form onSubmit={submitProof} className="mt-4 grid gap-3">
            {gasEstimateQuery.error && (
              <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
                {gasEstimateQuery.error.message === 'This task is already completed by your wallet.'
                  ? gasEstimateQuery.error.message
                  : 'The fee estimate is unavailable. Check your Celo connection; MetaMask will show the fee before you approve.'}
                <button type="button" onClick={() => void gasEstimateQuery.refetch()} className="ml-2 font-semibold underline">Retry estimate</button>
              </p>
            )}
            {gasEstimateQuery.data && BigInt(gasEstimateQuery.data.balance) < BigInt(gasEstimateQuery.data.fee) && (
              <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
                Your Celo wallet balance is below the estimated transaction fee. Add CELO before submitting.
              </p>
            )}
            <textarea value={proofText} onChange={(e) => setProofText(e.target.value)} maxLength={2000} placeholder="Explain how you completed the task" className={`${inputClass} min-h-20`} />
            <input type="url" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Proof link (optional)" className={inputClass} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload size={15} /> Screenshot (JPEG, PNG, WebP; up to 5 MB)
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} className="text-xs" />
            </label>
            <button
              type="submit"
              disabled={!!busy || !ESCROW_ADDRESS || gasEstimateQuery.isPending || Boolean(gasEstimateQuery.data && BigInt(gasEstimateQuery.data.balance) < BigInt(gasEstimateQuery.data.fee))}
              className={`${buttonClass} w-fit`}
            >
              Reserve slot and submit
            </button>
          </form>
        </section>
      )}

      {activeView === 'mine' && myCreatedTasks.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Tasks you created</h2>
            <button type="button" disabled={!!busy} onClick={() => void loadMyTasks().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your tasks.'))} className="text-sm font-semibold text-primary">
              Refresh
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {myCreatedTasks.map((task) => (
              <article key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.claimed_slots} of {task.total_slots} slots claimed · {task.total_slots - task.claimed_slots} open
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <ExpiryCountdown expiresAt={task.expires_at} />
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">{task.status}</span>
                  {task.status === 'open' && <button type="button" disabled={!!busy || !ESCROW_ADDRESS} onClick={() => closeTask(task)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40">Close task</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeView === 'mine' && myTasksLoaded && myCreatedTasks.length === 0 && (
        <p className="mt-8 rounded-xl border border-line bg-card p-5 text-sm text-muted-foreground">You haven’t created any tasks yet.</p>
      )}

      {activeView === 'explore' && <section id="explore-tasks" className="mt-8 scroll-mt-24">
        <h2 className="font-display text-xl font-bold">Open tasks</h2>
        {openTasks.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-card p-5 text-sm text-muted-foreground">No open tasks yet.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {openTasks.map((task) => (
              <article id={`task-${task.id}`} key={task.id} className="scroll-mt-24 rounded-2xl border border-line bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-bold">{task.title}</h3>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold text-accent-foreground">
                    {formatUnits(BigInt(task.reward_per_completion), 18)} G$
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>
                <p className="mt-3 text-xs font-semibold text-muted-foreground">Proof requirements</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{task.requirements}</p>
                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  {task.slots} of {task.total_slots} slots open · by {task.creator_address.slice(0, 6)}…{task.creator_address.slice(-4)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground"><ExpiryCountdown expiresAt={task.expires_at} /></p>
                <button
                  type="button"
                  disabled={!address || address.toLowerCase() === task.creator_address.toLowerCase() || !!busy || !ESCROW_ADDRESS}
                  onClick={() => { setError(''); setProofTask(task); }}
                  className={`${buttonClass} mt-4`}
                >
                  {address?.toLowerCase() === task.creator_address.toLowerCase() ? 'Your task' : 'Complete task'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>}

      {activeView === 'mine' && mySubmissions.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Your submissions</h2>
            <button type="button" disabled={!!busy} onClick={() => loadMyTasks().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load submission status.'))} className="text-sm font-semibold text-primary">
              Refresh status
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {mySubmissions.map((submission) => (
              <article key={submission.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-card p-4">
                <div>
                  <p className="text-sm font-semibold">{submission.task.title}</p>
                  {submission.status === 'approved' && <p className="mt-1 text-xs font-semibold text-success">Approved · {formatUnits(BigInt(submission.task.reward_per_completion), 18)} G$ paid</p>}
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">{submission.status}</span>
              </article>
            ))}
          </div>
        </section>
      )}
      {activeView === 'mine' && myTasksLoaded && mySubmissions.length === 0 && (
        <p className="mt-8 rounded-xl border border-line bg-card p-5 text-sm text-muted-foreground">No task submissions yet.</p>
      )}

    </div>
  );
}
