import { NextRequest, NextResponse } from 'next/server';
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
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/review-queue', {}, true, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;

  const supabase = createServerSupabaseClient();
  const [{ data: applications, error: applicationsError }, { data: content, error: contentError }] = await Promise.all([
    supabase.from('tipjar_campaign_applications')
      .select('id,campaign_id,participant_address,application_text,status,created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    supabase.from('tipjar_campaign_content')
      .select('id,application_id,content_url,status,created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
  ]);
  if (applicationsError || contentError) {
    console.error('Campaign review queue load failed:', applicationsError || contentError);
    return NextResponse.json({ error: 'Could not load campaign review items.' }, { status: 503 });
  }

  const pendingContent = content || [];
  const [campaignIds, contentApplicationIds] = [
    [...new Set((applications || []).map((item) => item.campaign_id))],
    [...new Set(pendingContent.map((item) => item.application_id))],
  ];
  const [{ data: campaigns, error: campaignsError }, { data: allApplications, error: allApplicationsError }] = await Promise.all([
    campaignIds.length
      ? supabase.from('tipjar_campaigns').select('id,escrow_campaign_id,title,requirements,reward_per_participant,max_participants,creator_address').in('id', campaignIds)
      : Promise.resolve({ data: [], error: null }),
    contentApplicationIds.length
      ? supabase.from('tipjar_campaign_applications').select('id,campaign_id,participant_address,application_text,status').in('id', contentApplicationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (campaignsError || allApplicationsError) {
    console.error('Campaign review context load failed:', campaignsError || allApplicationsError);
    return NextResponse.json({ error: 'Could not load campaign review details.' }, { status: 503 });
  }

  const campaignMap = new Map((campaigns || []).map((campaign) => [campaign.id, campaign]));
  const applicationItems = (applications || []).flatMap((application) => {
    const campaign = campaignMap.get(application.campaign_id);
    return campaign ? [{ ...application, campaign }] : [];
  });
  const missingCampaignIds = [...new Set(
    (allApplications || []).map((application) => application.campaign_id).filter((id) => !campaignMap.has(id)),
  )];
  const { data: contentCampaigns, error: contentCampaignsError } = missingCampaignIds.length
    ? await supabase.from('tipjar_campaigns')
      .select('id,escrow_campaign_id,title,requirements,reward_per_participant,max_participants,creator_address')
      .in('id', missingCampaignIds)
    : { data: [], error: null };
  if (contentCampaignsError) {
    console.error('Campaign review context load failed:', contentCampaignsError);
    return NextResponse.json({ error: 'Could not load campaign review details.' }, { status: 503 });
  }
  for (const campaign of contentCampaigns || []) campaignMap.set(campaign.id, campaign);

  const applicationMap = new Map((allApplications || []).map((application) => [application.id, application]));
  const contentItems = pendingContent.flatMap((item) => {
    const application = applicationMap.get(item.application_id);
    const campaign = application && campaignMap.get(application.campaign_id);
    return application && campaign ? [{ ...item, application, campaign }] : [];
  });

  return NextResponse.json({
    applications: applicationItems,
    content: contentItems,
    reviewer: verified.address,
  });
}
