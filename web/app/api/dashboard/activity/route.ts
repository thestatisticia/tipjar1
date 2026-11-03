import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isAddress } from 'viem';

type ActivityCategory = 'task' | 'campaign' | 'tip' | 'spin';

interface ActivityEvent {
  id: string;
  category: ActivityCategory;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  amount?: string;
  transactionHash?: string | null;
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Wallet activity is temporarily unavailable.' }, { status: 503 });
  }
  const supabase = createServerSupabaseClient();
  const normalizedWallet = wallet.toLowerCase();
  try {
    const [submissionResult, applicationResult, awardsResult, sentTipsResult, creatorResult] = await Promise.all([
      supabase.from('tipjar_task_submissions')
        .select('id,task_id,status,created_at,updated_at,review_tx_hash')
        .eq('worker_address', normalizedWallet)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase.from('tipjar_campaign_applications')
        .select('id,campaign_id,status,created_at,updated_at,review_tx_hash')
        .eq('participant_address', normalizedWallet)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase.from('tipjar_spin_awards')
        .select('id,source_type,prize_g,status,payout_tx_hash,created_at,paid_at')
        .eq('wallet_address', normalizedWallet)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('tipjar_tips')
        .select('id,creator_username,amount,created_at,tx_hash')
        .ilike('sender_address', normalizedWallet)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('tipjar_creators')
        .select('username')
        .eq('wallet_address', normalizedWallet)
        .maybeSingle(),
    ]);

    const queryError = submissionResult.error || applicationResult.error ||
      awardsResult.error || sentTipsResult.error;
    if (queryError) throw queryError;
    if (creatorResult.error) {
      console.error('Creator profile lookup failed while loading wallet activity:', creatorResult.error);
    }

    const submissions = submissionResult.data ?? [];
    const applications = applicationResult.data ?? [];
    const [tasksResult, campaignsResult, contentResult, receivedTipsResult] = await Promise.all([
      submissions.length
        ? supabase.from('tipjar_tasks')
          .select('id,title,reward_per_completion')
          .in('id', [...new Set(submissions.map((submission) => submission.task_id))])
        : Promise.resolve({ data: [], error: null }),
      applications.length
        ? supabase.from('tipjar_campaigns')
          .select('id,title,reward_per_participant')
          .in('id', [...new Set(applications.map((application) => application.campaign_id))])
        : Promise.resolve({ data: [], error: null }),
      applications.length
        ? supabase.from('tipjar_campaign_content')
          .select('id,application_id,status,updated_at,review_tx_hash')
          .in('application_id', applications.map((application) => application.id))
        : Promise.resolve({ data: [], error: null }),
      creatorResult.data?.username
        ? supabase.from('tipjar_tips')
          .select('id,sender_name,amount,created_at,tx_hash')
          .eq('creator_username', creatorResult.data.username)
          .order('created_at', { ascending: false })
          .limit(30)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const relatedError = tasksResult.error || campaignsResult.error || contentResult.error || receivedTipsResult.error;
    if (relatedError) throw relatedError;

    const taskById = new Map((tasksResult.data ?? []).map((task) => [task.id, task]));
    const campaignById = new Map((campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign]));
    const contentByApplication = new Map((contentResult.data ?? []).map((content) => [content.application_id, content]));
    const events: ActivityEvent[] = [];

    for (const submission of submissions) {
      const task = taskById.get(submission.task_id);
      if (!task) continue;
      if (submission.status === 'pending') {
        events.push({
          id: `task:${submission.id}:submitted`,
          category: 'task',
          title: 'Task submitted',
          description: task.title,
          status: 'Under review',
          createdAt: submission.created_at,
        });
      } else {
        const approved = submission.status === 'approved';
        events.push({
          id: `task:${submission.id}:${submission.status}`,
          category: 'task',
          title: approved ? 'Task approved' : 'Task submission rejected',
          description: task.title,
          status: approved ? 'Approved' : 'Rejected',
          createdAt: submission.updated_at,
          ...(approved ? { amount: task.reward_per_completion } : {}),
          transactionHash: submission.review_tx_hash,
        });
      }
    }

    for (const application of applications) {
      const campaign = campaignById.get(application.campaign_id);
      if (!campaign) continue;
      const content = contentByApplication.get(application.id);
      const applicationTitles: Record<string, string> = {
        pending: 'Campaign application submitted',
        approved: 'Campaign application approved',
        rejected: 'Campaign application rejected',
        completed: 'Campaign reward paid',
      };
      events.push({
        id: `campaign:${application.id}:${application.status}`,
        category: 'campaign',
        title: applicationTitles[application.status] || 'Campaign application updated',
        description: campaign.title,
        status: application.status === 'completed' ? 'Paid' : application.status,
        createdAt: application.updated_at,
        ...(application.status === 'completed' ? { amount: campaign.reward_per_participant } : {}),
        transactionHash: application.review_tx_hash,
      });

      if (content) {
        const contentTitles: Record<string, string> = {
          pending: 'Campaign work submitted',
          approved: 'Campaign work approved',
          rejected: 'Campaign work needs changes',
        };
        events.push({
          id: `campaign-content:${content.id}:${content.status}`,
          category: 'campaign',
          title: contentTitles[content.status] || 'Campaign work updated',
          description: campaign.title,
          status: content.status === 'pending' ? 'Under review' : content.status,
          createdAt: content.updated_at,
          transactionHash: content.review_tx_hash,
        });
      }
    }

    for (const award of awardsResult.data ?? []) {
      events.push({
        id: `spin:${award.id}:${award.status}`,
        category: 'spin',
        title: award.status === 'paid' ? 'Spin reward paid' : award.status === 'failed' ? 'Spin reward failed' : 'Spin result',
        description: `${award.prize_g} G$ · ${award.source_type === 'ubi_claim' ? 'UBI claim' : 'completed task'}`,
        status: award.status === 'paid' ? 'Paid' : award.status === 'failed' ? 'Failed' : 'Payout pending',
        createdAt: award.paid_at || award.created_at,
        amount: String(award.prize_g),
        transactionHash: award.payout_tx_hash,
      });
    }

    for (const tip of receivedTipsResult.data ?? []) {
      events.push({
        id: `tip:received:${tip.id}`,
        category: 'tip',
        title: 'G$ tip received',
        description: `From ${tip.sender_name || 'a community member'}`,
        status: 'Received',
        createdAt: tip.created_at,
        amount: `${tip.amount}`,
        transactionHash: tip.tx_hash,
      });
    }

    for (const tip of sentTipsResult.data ?? []) {
      events.push({
        id: `tip:sent:${tip.id}`,
        category: 'tip',
        title: 'G$ tip sent',
        description: `To @${tip.creator_username}`,
        status: 'Sent',
        createdAt: tip.created_at,
        amount: `${tip.amount}`,
        transactionHash: tip.tx_hash,
      });
    }

    return NextResponse.json(events
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 40), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Dashboard activity load failed:', error);
    return NextResponse.json({ error: 'Could not load wallet activity. Please retry shortly.' }, { status: 503 });
  }
}
