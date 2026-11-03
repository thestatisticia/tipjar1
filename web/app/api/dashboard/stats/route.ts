import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { createServerSupabaseClient } from '@/lib/supabase';

const PAGE_SIZE = 1000;
const IN_FILTER_SIZE = 200;

async function loadAll<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Dashboard stats are not configured on the server.' }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const normalizedWallet = wallet.toLowerCase();
    const [approvedTasks, completedApplications, pendingSpinAwards] = await Promise.all([
      loadAll((from, to) => supabase.from('tipjar_task_submissions')
        .select('task_id')
        .eq('worker_address', normalizedWallet)
        .eq('status', 'approved')
        .range(from, to)),
      loadAll((from, to) => supabase.from('tipjar_campaign_applications')
        .select('id,campaign_id')
        .eq('participant_address', normalizedWallet)
        .eq('status', 'completed')
        .range(from, to)),
      loadAll((from, to) => supabase.from('tipjar_spin_awards')
        .select('prize_g')
        .eq('wallet_address', normalizedWallet)
        .eq('status', 'pending')
        .range(from, to)),
    ]);

    let taskEarnings = BigInt(0);
    const taskIds = [...new Set(approvedTasks.map((submission) => submission.task_id))];
    for (let i = 0; i < taskIds.length; i += IN_FILTER_SIZE) {
      const { data, error } = await supabase.from('tipjar_tasks')
        .select('id,reward_per_completion')
        .in('id', taskIds.slice(i, i + IN_FILTER_SIZE));
      if (error) throw error;
      for (const task of data ?? []) taskEarnings += BigInt(task.reward_per_completion);
    }

    let campaignEarnings = BigInt(0);
    let approvedPosts = 0;
    const applications = completedApplications;
    for (let i = 0; i < applications.length; i += IN_FILTER_SIZE) {
      const chunk = applications.slice(i, i + IN_FILTER_SIZE);
      const [{ data: campaigns, error: campaignsError }, { data: posts, error: postsError }] = await Promise.all([
        supabase.from('tipjar_campaigns')
          .select('id,reward_per_participant')
          .in('id', [...new Set(chunk.map((application) => application.campaign_id))]),
        supabase.from('tipjar_campaign_content')
          .select('id,status')
          .in('application_id', chunk.map((application) => application.id))
          .eq('status', 'approved'),
      ]);
      if (campaignsError) throw campaignsError;
      if (postsError) throw postsError;

      const rewardByCampaign = new Map((campaigns ?? []).map((campaign) => [
        campaign.id,
        BigInt(campaign.reward_per_participant),
      ]));
      for (const application of chunk) {
        campaignEarnings += rewardByCampaign.get(application.campaign_id) ?? BigInt(0);
      }
      approvedPosts += posts?.length ?? 0;
    }

    return NextResponse.json({
      taskEarnings: taskEarnings.toString(),
      campaignEarnings: campaignEarnings.toString(),
      pendingSpinRewards: pendingSpinAwards
        .reduce((total, award) => total + BigInt(award.prize_g), BigInt(0))
        .toString(),
      approvedPosts,
    });
  } catch (error) {
    console.error('Creator dashboard stats load failed:', error);
    return NextResponse.json({ error: 'Could not load creator earnings stats.' }, { status: 503 });
  }
}
