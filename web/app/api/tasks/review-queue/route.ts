import { NextRequest, NextResponse } from 'next/server';
import { MAIN_ADMIN_WALLET } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const auth = body.auth as TaskAuth | undefined;
  const verified = await verifyTaskAuth(auth, 'POST', '/api/tasks/review-queue', body, true);
  if (isAuthFailure(verified)) return verified;

  const supabase = createServerSupabaseClient();
  const [
    { data: submissions, error: submissionsError },
    { data: applications, error: applicationsError },
    { data: pendingContent, error: contentError },
  ] = await Promise.all([
    supabase.from('tipjar_task_submissions')
      .select('id,task_id,worker_address,proof_text,proof_url,proof_storage_path,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.from('tipjar_campaign_applications')
      .select('id,campaign_id,participant_address,application_text,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.from('tipjar_campaign_content')
      .select('id,application_id,content_url,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  if (submissionsError || applicationsError || contentError) {
    console.error('Admin review queue load failed:', submissionsError || applicationsError || contentError);
    return NextResponse.json({ error: 'Could not load approval queues.' }, { status: 503 });
  }

  const taskIds = [...new Set((submissions || []).map((submission) => submission.task_id))];
  const contentApplicationIds = [...new Set((pendingContent || []).map((item) => item.application_id))];
  const applicationCampaignIds = [...new Set((applications || []).map((item) => item.campaign_id))];
  const [{ data: tasks, error: tasksError }, { data: campaignApplications, error: campaignApplicationsError }] =
    await Promise.all([
      taskIds.length
        ? supabase.from('tipjar_tasks')
          .select('id,escrow_task_id,title,requirements,reward_per_completion,slots,creator_address')
          .in('id', taskIds)
        : Promise.resolve({ data: [], error: null }),
      contentApplicationIds.length
        ? supabase.from('tipjar_campaign_applications')
          .select('id,campaign_id,participant_address,application_text,status')
          .in('id', contentApplicationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (tasksError || campaignApplicationsError) {
    console.error('Admin review queue context load failed:', tasksError || campaignApplicationsError);
    return NextResponse.json({ error: 'Could not load approval details.' }, { status: 503 });
  }

  const campaignIds = [...new Set([
    ...applicationCampaignIds,
    ...(campaignApplications || []).map((application) => application.campaign_id),
  ])];
  const [{ data: campaigns, error: campaignsError }, { data: wallets, error: walletsError }] = await Promise.all([
    campaignIds.length
      ? supabase.from('tipjar_campaigns')
        .select('id,escrow_campaign_id,title,requirements,reward_per_participant,max_participants,creator_address')
        .in('id', campaignIds)
      : Promise.resolve({ data: [], error: null }),
    verified.address.toLowerCase() === MAIN_ADMIN_WALLET.toLowerCase()
      ? supabase.from('tipjar_admin_wallets')
        .select('wallet_address,added_by,created_at')
        .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (campaignsError || walletsError) {
    console.error('Admin review queue details failed:', campaignsError || walletsError);
    return NextResponse.json({ error: 'Could not load approval details.' }, { status: 503 });
  }

  const taskById = new Map((tasks || []).map((task) => [task.id, task]));
  const campaignById = new Map((campaigns || []).map((campaign) => [campaign.id, campaign]));
  const applicationById = new Map((campaignApplications || []).map((application) => [application.id, application]));

  const taskItems = await Promise.all((submissions || []).map(async (submission) => {
    const task = taskById.get(submission.task_id);
    if (!task) {
      console.error('Task review queue contains a missing task:', submission.task_id);
      return null;
    }
    const proof = submission.proof_storage_path
      ? await supabase.storage.from('tipjar-task-proofs').createSignedUrl(submission.proof_storage_path, 15 * 60)
      : { data: null, error: null };
    if (proof.error) {
      console.error('Task proof signed URL creation failed:', proof.error);
      throw new Error('Could not load proof screenshots.');
    }
    return { ...submission, task, proof_image_url: proof.data?.signedUrl ?? '' };
  })).catch((error: unknown) => {
    console.error('Task review proof lookup failed:', error);
    return null;
  });
  if (!taskItems) {
    return NextResponse.json({ error: 'Could not load proof screenshots.' }, { status: 503 });
  }

  const applicationItems = (applications || []).flatMap((application) => {
    const campaign = campaignById.get(application.campaign_id);
    return campaign ? [{ ...application, campaign }] : [];
  });
  const contentItems = (pendingContent || []).flatMap((item) => {
    const application = applicationById.get(item.application_id);
    const campaign = application && campaignById.get(application.campaign_id);
    return application && campaign ? [{ ...item, application, campaign }] : [];
  });

  return NextResponse.json({
    tasks: taskItems.filter((item): item is NonNullable<typeof item> => item !== null),
    applications: applicationItems,
    content: contentItems,
    wallets: wallets || [],
    reviewer: verified.address,
  });
}
