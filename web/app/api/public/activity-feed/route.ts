import { NextResponse } from 'next/server';
import { formatUnits } from 'viem';
import { createServerSupabaseClient } from '@/lib/supabase';

interface ActivityItem {
  id: string;
  createdAt: string;
  message: string;
}

function getDemoActivity(): ActivityItem[] {
  const createdAt = new Date().toISOString();
  return [
    {
      id: 'demo:approved-task',
      createdAt,
      message: '0x111…111 had a task approved · earned 10 G$',
    },
    {
      id: 'demo:spin-win',
      createdAt,
      message: '0x1112…1112 won 50 G$ from a spin',
    },
    {
      id: 'demo:ubi-claim',
      createdAt,
      message: '0x…111 claimed daily UBI',
    },
  ];
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatReward(rawAmount: string) {
  const [whole, rawFraction = ''] = formatUnits(BigInt(rawAmount), 18).split('.');
  const fraction = rawFraction.slice(0, 2).replace(/0+$/, '');
  return `${new Intl.NumberFormat().format(BigInt(whole))}${fraction ? `.${fraction}` : ''}`;
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Public activity feed is not configured.' }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const [tasksResult, campaignsResult, spinsResult] = await Promise.all([
      supabase.from('tipjar_task_submissions')
        .select('id,task_id,worker_address,updated_at')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(12),
      supabase.from('tipjar_campaign_applications')
        .select('id,campaign_id,participant_address,updated_at')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(12),
      supabase.from('tipjar_spin_awards')
        .select('id,wallet_address,source_type,prize_g,paid_at')
        .eq('status', 'paid')
        .eq('source_type', 'ubi_claim')
        .gt('prize_g', 0)
        .order('paid_at', { ascending: false })
        .limit(12),
    ]);

    const queryError = tasksResult.error || campaignsResult.error || spinsResult.error;
    if (queryError) throw queryError;

    const tasks = tasksResult.data ?? [];
    const campaigns = campaignsResult.data ?? [];
    const taskIds = [...new Set(tasks.map((task) => task.task_id))];
    const campaignIds = [...new Set(campaigns.map((campaign) => campaign.campaign_id))];
    const [{ data: taskDetails, error: taskDetailsError }, { data: campaignDetails, error: campaignDetailsError }] =
      await Promise.all([
        taskIds.length
          ? supabase.from('tipjar_tasks').select('id,title,reward_per_completion').in('id', taskIds)
          : Promise.resolve({ data: [], error: null }),
        campaignIds.length
          ? supabase.from('tipjar_campaigns').select('id,title,reward_per_participant').in('id', campaignIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (taskDetailsError || campaignDetailsError) throw taskDetailsError || campaignDetailsError;

    const taskById = new Map((taskDetails ?? []).map((task) => [task.id, task]));
    const campaignById = new Map((campaignDetails ?? []).map((campaign) => [campaign.id, campaign]));
    const activity: ActivityItem[] = [];

    for (const task of tasks) {
      const details = taskById.get(task.task_id);
      if (!details) continue;
      activity.push({
        id: `task:${task.id}`,
        createdAt: task.updated_at,
        message: `${shortAddress(task.worker_address)} had a task approved: ${details.title} · earned ${formatReward(details.reward_per_completion)} G$`,
      });
    }

    for (const campaign of campaigns) {
      const details = campaignById.get(campaign.campaign_id);
      if (!details) continue;
      activity.push({
        id: `campaign:${campaign.id}`,
        createdAt: campaign.updated_at,
        message: `${shortAddress(campaign.participant_address)} completed a campaign: ${details.title} · earned ${formatReward(details.reward_per_participant)} G$`,
      });
    }

    for (const spin of spinsResult.data ?? []) {
      activity.push({
        id: `spin:${spin.id}`,
        createdAt: spin.paid_at ?? '',
        message: `${shortAddress(spin.wallet_address)} won ${new Intl.NumberFormat().format(Number(spin.prize_g))} G$ from a spin after a verified daily UBI claim`,
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      activity.push(...getDemoActivity());
    }

    activity.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return NextResponse.json(activity.slice(0, 20));
  } catch (error) {
    console.error('Public activity feed load failed:', error);
    return NextResponse.json({ error: 'Could not load live community activity.' }, { status: 503 });
  }
}
