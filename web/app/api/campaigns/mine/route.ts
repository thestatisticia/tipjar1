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
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/mine', {}, false, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;

  const supabase = createServerSupabaseClient();
  const wallet = verified.address.toLowerCase();
  const [{ data: applications, error }, { data: createdCampaigns, error: campaignsError }] = await Promise.all([
    supabase.from('tipjar_campaign_applications')
      .select('id,campaign_id,application_text,status,review_note,created_at')
      .eq('participant_address', wallet)
      .order('updated_at', { ascending: false }).limit(100),
    supabase.from('tipjar_campaigns')
      .select('id,escrow_campaign_id,creator_address,title,description,requirements,budget,reward_per_participant,max_participants,status,created_at,duration_days,expires_at')
      .eq('creator_address', wallet)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (error) {
    console.error('Campaign application history load failed:', error);
    return NextResponse.json({ error: 'Could not load your campaign history.' }, { status: 503 });
  }
  if (campaignsError) {
    console.error('Created campaign history load failed:', campaignsError);
    return NextResponse.json({ error: 'Could not load your created campaigns.' }, { status: 503 });
  }
  const results = [];
  for (const application of applications || []) {
    const [{ data: campaign, error: campaignError }, { data: content, error: contentError }] = await Promise.all([
      supabase.from('tipjar_campaigns')
        .select('id,title,reward_per_participant,requirements,status')
        .eq('id', application.campaign_id).single(),
      supabase.from('tipjar_campaign_content')
        .select('id,content_url,status,review_note')
        .eq('application_id', application.id).maybeSingle(),
    ]);
    if (campaignError || contentError) {
      console.error('Campaign history context load failed:', campaignError || contentError);
      return NextResponse.json({ error: 'Could not load your campaign history.' }, { status: 503 });
    }
    if (campaign) results.push({ ...application, campaign, content });
  }
  const campaignIds = (createdCampaigns || []).map((campaign) => campaign.id);
  const { data: participants, error: participantsError } = campaignIds.length
    ? await supabase.from('tipjar_campaign_applications')
      .select('campaign_id')
      .in('campaign_id', campaignIds)
      .in('status', ['approved', 'completed'])
    : { data: [], error: null };
  if (participantsError) {
    console.error('Created campaign progress lookup failed:', participantsError);
    return NextResponse.json({ error: 'Could not load campaign participant progress.' }, { status: 503 });
  }

  const participantCounts = new Map<string, number>();
  for (const application of participants || []) {
    participantCounts.set(application.campaign_id, (participantCounts.get(application.campaign_id) || 0) + 1);
  }
  const campaignResults = (createdCampaigns || []).map((campaign) => {
    const participantsCount = participantCounts.get(campaign.id) || 0;
    return {
      ...campaign,
      claimed_participants: participantsCount,
      available_participants: Math.max(0, campaign.max_participants - participantsCount),
    };
  });
  return NextResponse.json({ applications: results, createdCampaigns: campaignResults });
}
