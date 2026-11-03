import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const auth = body.auth as TaskAuth | undefined;
  const { campaignId, applicationText } = body;
  const payload = { campaignId, applicationText };
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/applications', payload, false, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;

  if (typeof campaignId !== 'string' || !UUID.test(campaignId) || typeof applicationText !== 'string' || applicationText.trim().length < 10 || applicationText.length > 2000) {
    return NextResponse.json({ error: 'Application details are invalid.' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const { data: campaign, error: campaignError } = await supabase
    .from('tipjar_campaigns')
    .select('id,creator_address,status,max_participants,expires_at')
    .eq('id', campaignId)
    .single();
  if (campaignError || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  if (campaign.status !== 'open') return NextResponse.json({ error: 'This campaign is closed.' }, { status: 409 });
  if (campaign.expires_at && new Date(campaign.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This campaign has expired and is no longer accepting applications.' }, { status: 409 });
  }
  if (campaign.creator_address.toLowerCase() === verified.address.toLowerCase()) {
    return NextResponse.json({ error: 'Campaign creators cannot apply to their own campaign.' }, { status: 403 });
  }
  const { count, error: participantCountError } = await supabase.from('tipjar_campaign_applications')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['approved', 'completed']);
  if (participantCountError) {
    console.error('Campaign participant count failed:', participantCountError);
    return NextResponse.json({ error: 'Could not check participant capacity.' }, { status: 503 });
  }
  if ((count || 0) >= campaign.max_participants) {
    return NextResponse.json({ error: 'This campaign has no participant spots remaining.' }, { status: 409 });
  }

  const { data, error } = await supabase.from('tipjar_campaign_applications').insert({
    campaign_id: campaignId,
    participant_address: verified.address.toLowerCase(),
    application_text: applicationText.trim(),
  }).select().single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'You have already applied to this campaign.' }, { status: 409 });
    console.error('Campaign application failed:', error);
    return NextResponse.json({ error: 'Could not save your application.' }, { status: 503 });
  }
  return NextResponse.json(data, { status: 201 });
}
