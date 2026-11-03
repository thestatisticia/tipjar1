'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, keccak256, maxUint256, parseUnits, stringToHex, type Hex } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { ExternalLink, Loader2, Megaphone, Wallet } from 'lucide-react';
import { useTaskSignature } from '@/hooks/useTaskSignature';
import { ERC20_ABI, G_DOLLAR_ADDRESS } from '@/lib/contracts';
import { CAMPAIGN_ESCROW_ABI } from '@/lib/campaignChain';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import { getWalletActionErrorMessage } from '@/lib/walletErrors';
import { notifyActivityChanged } from '@/lib/notificationState';

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS as `0x${string}` | undefined;

interface Campaign {
  id: string;
  escrow_campaign_id: Hex;
  creator_address: string;
  title: string;
  description: string;
  requirements: string;
  budget: string;
  reward_per_participant: string;
  max_participants: number;
  claimed_participants?: number;
  available_participants: number;
  duration_days: number | null;
  expires_at: string | null;
  status: string;
}

interface MyApplication {
  id: string;
  status: string;
  application_text: string;
  review_note: string;
  campaign: Pick<Campaign, 'id' | 'title' | 'reward_per_participant' | 'requirements' | 'status'>;
  content: { id: string; content_url: string; status: string; review_note: string } | null;
}

interface MyCampaignsResult {
  applications: MyApplication[];
  createdCampaigns: Campaign[];
}

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function CampaignsPage() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: 42220 });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const signRequest = useTaskSignature();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [budget, setBudget] = useState('');
  const [participantLimit, setParticipantLimit] = useState('10');
  const [durationDays, setDurationDays] = useState('30');
  const [applyCampaign, setApplyCampaign] = useState<Campaign | null>(null);
  const [applicationText, setApplicationText] = useState('');
  const [contentApplication, setContentApplication] = useState<MyApplication | null>(null);
  const [contentUrl, setContentUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [myApplications, setMyApplications] = useState<MyApplication[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const campaignsQuery = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => responseJson(await fetch('/api/campaigns')),
  });
  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);
  const publicCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.creator_address.toLowerCase() !== address?.toLowerCase()),
    [campaigns, address],
  );

  useEffect(() => {
    if (!campaignsQuery.data || !window.location.hash.startsWith('#campaign-')) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [campaignsQuery.data]);

  const refreshCampaigns = async () => { await campaignsQuery.refetch(); };
  const ensureCelo = async () => {
    if (chainId !== 42220) await switchChainAsync({ chainId: 42220 });
  };

  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !publicClient || !ESCROW_ADDRESS) {
      setError(!ESCROW_ADDRESS ? 'Campaign escrow is not configured. Deploy CampaignEscrow and set NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS.' : 'Connect MetaMask first.');
      return;
    }
    const maxParticipants = Number(participantLimit);
    if (!Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 10000) {
      setError('Choose between 1 and 10,000 participants.');
      return;
    }
    const campaignDurationDays = Number(durationDays);
    if (!Number.isInteger(campaignDurationDays) || campaignDurationDays < 1 || campaignDurationDays > 365) {
      setError('Choose a campaign duration between 1 and 365 days.');
      return;
    }
    let budgetUnits: bigint;
    try {
      budgetUnits = parseUnits(budget, 18);
    } catch {
      setError('Enter a valid G$ campaign budget.');
      return;
    }
    if (budgetUnits < BigInt(maxParticipants)) {
      setError('Budget must allocate at least 1 wei of G$ per participant.');
      return;
    }

    setError('');
    setNotice('');
    setBusy('Funding campaign…');
    try {
      await ensureCelo();
      const campaignUuid = crypto.randomUUID();
      const escrowCampaignId = keccak256(stringToHex(campaignUuid));
      const campaignDetails = {
        id: campaignUuid,
        escrowCampaignId,
        title: title.trim(),
        description: description.trim(),
        requirements: requirements.trim(),
        budget: budgetUnits.toString(),
        maxParticipants,
        durationDays: campaignDurationDays,
      };
      const auth = await signRequest('POST', '/api/campaigns', campaignDetails);
      const allowance = await publicClient.readContract({
        address: G_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ESCROW_ADDRESS],
      });
      if (allowance < budgetUnits) {
        const approveHash = await writeContractAsync({
          address: G_DOLLAR_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_ADDRESS, maxUint256],
          chainId: 42220,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      const transactionHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: CAMPAIGN_ESCROW_ABI,
        functionName: 'createCampaign',
        args: [escrowCampaignId, budgetUnits, maxParticipants],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });

      const savedCampaign = await responseJson(await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...campaignDetails, transactionHash, auth }),
      })) as Campaign;
      setMyCampaigns((current) => [{
        ...savedCampaign,
        available_participants: maxParticipants,
      }, ...current]);
      setTitle('');
      setDescription('');
      setRequirements('');
      setBudget('');
      setParticipantLimit('10');
      setDurationDays('30');
      setNotice('Campaign created and its G$ budget is in escrow.');
      await refreshCampaigns();
    } catch (err) {
      setError(getWalletActionErrorMessage(err, 'campaign creation'));
    } finally {
      setBusy('');
    }
  };

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!applyCampaign) return;
    setError('');
    setNotice('');
    setBusy('Submitting campaign application…');
    try {
      const payload = { campaignId: applyCampaign.id, applicationText: applicationText.trim() };
      const auth = await signRequest('POST', '/api/campaigns/applications', payload);
      await responseJson(await fetch('/api/campaigns/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, auth }),
      }));
      notifyActivityChanged();
      setApplyCampaign(null);
      setApplicationText('');
      setNotice('Application submitted for admin review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply to the campaign.');
    } finally {
      setBusy('');
    }
  };

  const submitContent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contentApplication) return;
    setError('');
    setNotice('');
    setBusy('Submitting content link…');
    try {
      const payload = { applicationId: contentApplication.id, contentUrl: contentUrl.trim() };
      const auth = await signRequest('POST', '/api/campaigns/content', payload);
      await responseJson(await fetch('/api/campaigns/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, auth }),
      }));
      setContentApplication(null);
      setContentUrl('');
      setNotice('Content link submitted for admin review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the content link.');
    } finally {
      setBusy('');
    }
  };

  const loadMyApplications = async () => {
    setError('');
    setBusy('Loading your applications…');
    try {
      const auth = await signRequest('POST', '/api/campaigns/mine', {});
      const result = await responseJson(await fetch('/api/campaigns/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth }),
      })) as MyCampaignsResult;
      setMyApplications(result.applications);
      setMyCampaigns(result.createdCampaigns);
      setHistoryLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your campaign history.');
    } finally {
      setBusy('');
    }
  };

  const closeCampaign = async (campaign: Campaign) => {
    if (!publicClient || !ESCROW_ADDRESS) return;
    if (!window.confirm('Close this campaign? Unallocated G$ will be refunded; approved participants keep their reserved share for content review.')) return;
    setError('');
    setNotice('');
    setBusy('Closing campaign…');
    try {
      const closeDetails = { campaignId: campaign.id };
      const auth = await signRequest('POST', '/api/campaigns/close', closeDetails);
      await ensureCelo();
      const transactionHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: CAMPAIGN_ESCROW_ABI,
        functionName: 'closeCampaign',
        args: [campaign.escrow_campaign_id],
        chainId: 42220,
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      await responseJson(await fetch('/api/campaigns/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...closeDetails, transactionHash, auth }),
      }));
      setNotice('Campaign closed. Unallocated G$ was refunded.');
      setMyCampaigns((current) => current.map((item) => item.id === campaign.id ? { ...item, status: 'closed' } : item));
      await refreshCampaigns();
    } catch (err) {
      setError(getWalletActionErrorMessage(err, 'campaign closure'));
    } finally {
      setBusy('');
    }
  };

  const inputClass = 'w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/40';
  const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40';
  const outlineButton = 'inline-flex h-10 items-center justify-center rounded-xl border border-line px-4 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-40';
  const formatG = (amount: string) => `${formatUnits(BigInt(amount), 18)} G$`;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Project creator partnerships</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="mt-2 text-sm text-muted-foreground">Projects escrow a G$ budget, approve participants, then reward approved content.</p>
        </div>
        <div className="flex gap-2">
          <button id="my-campaigns" type="button" disabled={!!busy} onClick={() => loadMyApplications()} className={`${outlineButton} scroll-mt-24`}>My campaigns & applications</button>
        </div>
      </div>

      {!ESCROW_ADDRESS && (
        <p role="alert" className="mt-5 rounded-xl border border-line bg-card p-4 text-sm">
          Campaigns are waiting for escrow deployment. Set <code>NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS</code> after deploying CampaignEscrow.
        </p>
      )}
      {campaignsQuery.error && <p role="alert" className="mt-5 rounded-xl bg-danger-bg p-3 text-sm text-danger">{campaignsQuery.error instanceof Error ? campaignsQuery.error.message : 'Could not load campaigns.'}</p>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
      {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />{busy}</p>}

      <section className="mt-8 rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-xl font-bold">Create a campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add the campaign brief first, then set the G$ budget and participant limit. Each approved participant earns an equal share.</p>
        <form onSubmit={createCampaign} className="mt-5 grid gap-4 md:grid-cols-2">
          <fieldset className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <legend className="mb-3 text-sm font-bold">Campaign details</legend>
            <label className="text-sm font-medium">
              Campaign title
              <input required minLength={3} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Community launch campaign" className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium">
              Campaign brief
              <textarea required maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the project and content you want created" className={`${inputClass} mt-1 min-h-24`} />
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Participant and content requirements
              <textarea required maxLength={2000} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Describe who can participate and what the submitted content must include" className={`${inputClass} mt-1 min-h-20`} />
            </label>
          </fieldset>
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:col-span-2 md:grid-cols-2">
            <legend className="px-1 text-sm font-bold">G$ budget and reach</legend>
            <label className="text-sm font-medium">
              Total G$ budget
              <input required inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 500" className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium">
              Maximum participants
              <input required type="number" min={1} max={10000} value={participantLimit} onChange={(e) => setParticipantLimit(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium">
              Campaign duration (days)
              <input required type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">
              The full budget is held in escrow. The app requests a persistent, unlimited G$ allowance for this escrow once so later campaign funding usually needs one transaction. Revoke it from your wallet if you stop using the escrow.
            </p>
          </fieldset>
          <div className="flex justify-end md:col-span-2">
            <button type="submit" disabled={!!busy || !ESCROW_ADDRESS} className={primaryButton}><Wallet size={15} /> Fund and publish</button>
          </div>
        </form>
      </section>

      {applyCampaign && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Apply: {applyCampaign.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{applyCampaign.requirements}</p>
            </div>
            <button type="button" onClick={() => setApplyCampaign(null)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
          <form onSubmit={apply} className="mt-4 grid gap-3">
            <textarea required minLength={10} maxLength={2000} value={applicationText} onChange={(e) => setApplicationText(e.target.value)} placeholder="Tell the project why you are a good fit and what content you plan to create" className={`${inputClass} min-h-24`} />
            <button type="submit" disabled={!!busy} className={`${primaryButton} w-fit`}>Submit application</button>
          </form>
        </section>
      )}

      {contentApplication && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Submit content: {contentApplication.campaign.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{contentApplication.campaign.requirements}</p>
            </div>
            <button type="button" onClick={() => setContentApplication(null)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
          <form onSubmit={submitContent} className="mt-4 grid gap-3">
            <input required type="url" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="Link to your campaign content" className={inputClass} />
            <button type="submit" disabled={!!busy} className={`${primaryButton} w-fit`}>Submit for admin review</button>
          </form>
        </section>
      )}

      {myCampaigns.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Your campaigns</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {myCampaigns.map((campaign) => (
              <article key={campaign.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{campaign.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Budget {formatG(campaign.budget)} · {campaign.claimed_participants ?? campaign.max_participants - campaign.available_participants} of {campaign.max_participants} participants approved
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground"><ExpiryCountdown expiresAt={campaign.expires_at} /></p>
                </div>
                {campaign.status === 'open' && <button type="button" disabled={!!busy || !ESCROW_ADDRESS} onClick={() => closeCampaign(campaign)} className={`${outlineButton} shrink-0`}>Close</button>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Open campaigns</h2>
        {publicCampaigns.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-card p-5 text-sm text-muted-foreground">No open campaigns right now.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {publicCampaigns.map((campaign) => (
              <article id={`campaign-${campaign.id}`} key={campaign.id} className="scroll-mt-24 rounded-2xl border border-line bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-bold">{campaign.title}</h3>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold text-accent-foreground">{formatG(campaign.reward_per_participant)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{campaign.description}</p>
                <p className="mt-3 text-xs font-semibold text-muted-foreground">Participant requirements</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{campaign.requirements}</p>
                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  {campaign.available_participants} of {campaign.max_participants} participant spots available · Project {campaign.creator_address.slice(0, 6)}…{campaign.creator_address.slice(-4)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground"><ExpiryCountdown expiresAt={campaign.expires_at} /></p>
                <button type="button" disabled={!address || !!busy || campaign.available_participants === 0} onClick={() => { setError(''); setApplyCampaign(campaign); }} className={`${primaryButton} mt-4`}>
                <Megaphone size={15} /> {campaign.available_participants === 0 ? 'Full' : 'Apply to campaign'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {historyLoaded && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Your applications</h2>
            <button type="button" disabled={!!busy} onClick={loadMyApplications} className="text-sm font-semibold text-primary">Refresh</button>
          </div>
          {myApplications.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No campaign applications yet.</p> : (
            <div className="mt-4 grid gap-3">
              {myApplications.map((application) => (
                <article key={application.id} className="rounded-xl border border-line bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{application.campaign.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Application: <span className="capitalize">{application.status}</span>
                        {application.content && <> · Content: <span className="capitalize">{application.content.status}</span></>}
                      </p>
                      {application.review_note && <p className="mt-2 text-sm text-muted-foreground">Review note: {application.review_note}</p>}
                      {application.content?.review_note && <p className="mt-1 text-sm text-muted-foreground">Content note: {application.content.review_note}</p>}
                    </div>
                    <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold text-accent-foreground">{formatG(application.campaign.reward_per_participant)}</span>
                  </div>
                  {application.content?.content_url && (
                    <a href={application.content.content_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary">View submitted content <ExternalLink size={12} /></a>
                  )}
                  {application.status === 'approved' && (!application.content || application.content.status === 'rejected') && (
                    <button type="button" disabled={!!busy} onClick={() => { setContentApplication(application); setContentUrl(application.content?.content_url || ''); }} className={`${primaryButton} mt-3`}>
                      Submit content link
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

    </div>
  );
}
