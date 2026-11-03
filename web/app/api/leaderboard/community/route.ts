import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const PAGE_SIZE = 1000;
const IN_FILTER_SIZE = 200;

interface ApprovedTaskSubmission {
  task_id: string;
  worker_address: string;
}

interface CompletedCampaignApplication {
  campaign_id: string;
  participant_address: string;
}

interface CommunityEarner {
  walletAddress: string;
  totalEarned: bigint;
  tasksCompleted: number;
  campaignsCompleted: number;
}

async function loadAll<T>(
  queryPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Community earnings are not configured on the server.' }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const [approvedTasks, completedApplications] = await Promise.all([
      loadAll<ApprovedTaskSubmission>((from, to) => supabase.from('tipjar_task_submissions')
        .select('task_id,worker_address')
        .eq('status', 'approved')
        .range(from, to)),
      loadAll<CompletedCampaignApplication>((from, to) => supabase.from('tipjar_campaign_applications')
        .select('campaign_id,participant_address')
        .eq('status', 'completed')
        .range(from, to)),
    ]);

    const taskIds = [...new Set(approvedTasks.map((submission) => submission.task_id))];
    const taskRewards = new Map<string, bigint>();
    for (let i = 0; i < taskIds.length; i += IN_FILTER_SIZE) {
      const { data, error } = await supabase.from('tipjar_tasks')
        .select('id,reward_per_completion')
        .in('id', taskIds.slice(i, i + IN_FILTER_SIZE));
      if (error) throw error;
      for (const task of data ?? []) taskRewards.set(task.id, BigInt(task.reward_per_completion));
    }

    const campaignIds = [...new Set(completedApplications.map((application) => application.campaign_id))];
    const campaignRewards = new Map<string, bigint>();
    for (let i = 0; i < campaignIds.length; i += IN_FILTER_SIZE) {
      const { data, error } = await supabase.from('tipjar_campaigns')
        .select('id,reward_per_participant')
        .in('id', campaignIds.slice(i, i + IN_FILTER_SIZE));
      if (error) throw error;
      for (const campaign of data ?? []) {
        campaignRewards.set(campaign.id, BigInt(campaign.reward_per_participant));
      }
    }

    const earners = new Map<string, CommunityEarner>();
    const addEarning = (address: string, amount: bigint, type: 'task' | 'campaign') => {
      const walletAddress = address.toLowerCase();
      const earner = earners.get(walletAddress) ?? {
        walletAddress,
        totalEarned: BigInt(0),
        tasksCompleted: 0,
        campaignsCompleted: 0,
      };
      earner.totalEarned += amount;
      if (type === 'task') earner.tasksCompleted += 1;
      else earner.campaignsCompleted += 1;
      earners.set(walletAddress, earner);
    };

    for (const submission of approvedTasks) {
      const reward = taskRewards.get(submission.task_id);
      if (reward !== undefined) addEarning(submission.worker_address, reward, 'task');
    }
    for (const application of completedApplications) {
      const reward = campaignRewards.get(application.campaign_id);
      if (reward !== undefined) addEarning(application.participant_address, reward, 'campaign');
    }

    const topEarners = [...earners.values()]
      .sort((a, b) => {
        if (a.totalEarned !== b.totalEarned) return a.totalEarned > b.totalEarned ? -1 : 1;
        const aContributions = a.tasksCompleted + a.campaignsCompleted;
        const bContributions = b.tasksCompleted + b.campaignsCompleted;
        if (aContributions !== bContributions) return bContributions - aContributions;
        return a.walletAddress.localeCompare(b.walletAddress);
      })
      .slice(0, 3)
      .map((earner, index) => ({
        rank: index + 1,
        walletAddress: earner.walletAddress,
        totalEarned: earner.totalEarned.toString(),
        tasksCompleted: earner.tasksCompleted,
        campaignsCompleted: earner.campaignsCompleted,
      }));

    return NextResponse.json(topEarners);
  } catch (error) {
    console.error('Community earner leaderboard load failed:', error);
    return NextResponse.json({ error: 'Could not load community earners.' }, { status: 503 });
  }
}
