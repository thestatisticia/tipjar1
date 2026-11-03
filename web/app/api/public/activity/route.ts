import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const PAGE_SIZE = 1000;
const IN_FILTER_SIZE = 200;

async function loadAll<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
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
    return NextResponse.json({ error: 'Public activity data is not configured.' }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const [approvedTasks, completedApplications, activeCampaignsResult] = await Promise.all([
      loadAll((from, to) => supabase.from('tipjar_task_submissions')
        .select('task_id')
        .eq('status', 'approved')
        .range(from, to)),
      loadAll((from, to) => supabase.from('tipjar_campaign_applications')
        .select('campaign_id')
        .eq('status', 'completed')
        .range(from, to)),
      supabase.from('tipjar_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]);

    if (activeCampaignsResult.error) throw activeCampaignsResult.error;

    let taskRewards = BigInt(0);
    const taskIds = [...new Set(approvedTasks.map((submission) => submission.task_id))];
    for (let i = 0; i < taskIds.length; i += IN_FILTER_SIZE) {
      const { data, error } = await supabase.from('tipjar_tasks')
        .select('id,reward_per_completion')
        .in('id', taskIds.slice(i, i + IN_FILTER_SIZE));
      if (error) throw error;
      for (const task of data ?? []) taskRewards += BigInt(task.reward_per_completion);
    }

    let campaignRewards = BigInt(0);
    const applicationChunks: typeof completedApplications[] = [];
    for (let i = 0; i < completedApplications.length; i += IN_FILTER_SIZE) {
      applicationChunks.push(completedApplications.slice(i, i + IN_FILTER_SIZE));
    }
    for (const applications of applicationChunks) {
      const { data, error } = await supabase.from('tipjar_campaigns')
        .select('id,reward_per_participant')
        .in('id', [...new Set(applications.map((application) => application.campaign_id))]);
      if (error) throw error;
      const rewardByCampaign = new Map((data ?? []).map((campaign) => [
        campaign.id,
        BigInt(campaign.reward_per_participant),
      ]));
      for (const application of applications) {
        const reward = rewardByCampaign.get(application.campaign_id);
        if (reward !== undefined) campaignRewards += reward;
      }
    }

    return NextResponse.json({
      tasksCompleted: approvedTasks.length,
      rewardsDistributed: (taskRewards + campaignRewards).toString(),
      openCampaigns: activeCampaignsResult.count ?? 0,
    });
  } catch (error) {
    console.error('Public platform activity lookup failed:', error);
    return NextResponse.json({ error: 'Could not load platform activity.' }, { status: 503 });
  }
}
