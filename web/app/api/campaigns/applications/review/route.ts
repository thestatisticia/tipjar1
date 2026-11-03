import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { findCampaignEvent, getCampaignReceipt } from '@/lib/campaignChain';
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
  const { applicationId, decision, reviewNote, transactionHash = null } = body;
  const payload = { applicationId, decision, reviewNote };
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/applications/review', payload, true, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;
  if (typeof applicationId !== 'string' || !UUID.test(applicationId) ||
      (decision !== 'approved' && decision !== 'rejected') ||
      typeof reviewNote !== 'string' || reviewNote.length > 1000 ||
      (decision === 'approved' && typeof transactionHash !== 'string') ||
      (decision === 'rejected' && !reviewNote.trim())) {
    return NextResponse.json({ error: 'Application review details are invalid.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: application, error: applicationError } = await supabase
    .from('tipjar_campaign_applications')
    .select('id,campaign_id,participant_address,status')
    .eq('id', applicationId).single();
  if (applicationError || !application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  if (application.status !== 'pending') return NextResponse.json({ error: 'Application was already reviewed.' }, { status: 409 });
  const { data: campaign, error: campaignError } = await supabase
    .from('tipjar_campaigns')
    .select('escrow_campaign_id,status,max_participants')
    .eq('id', application.campaign_id).single();
  if (campaignError || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  if (decision === 'approved') {
    if (campaign.status !== 'open') return NextResponse.json({ error: 'Campaign is closed.' }, { status: 409 });
    const { count, error: countError } = await supabase.from('tipjar_campaign_applications')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', application.campaign_id)
      .in('status', ['approved', 'completed']);
    if (countError) {
      console.error('Campaign participant count failed:', countError);
      return NextResponse.json({ error: 'Could not check participant capacity.' }, { status: 503 });
    }
    if ((count || 0) >= campaign.max_participants) {
      return NextResponse.json({ error: 'The campaign has no participant slots remaining.' }, { status: 409 });
    }
    const receipt = await getCampaignReceipt(transactionHash as string, verified.address);
    if (receipt instanceof NextResponse) return receipt;
    const event = findCampaignEvent(receipt.logs, 'ParticipantApproved');
    if (
      !event || event.eventName !== 'ParticipantApproved' ||
      event.args.campaignId.toLowerCase() !== campaign.escrow_campaign_id.toLowerCase() ||
      event.args.participant.toLowerCase() !== application.participant_address.toLowerCase() ||
      event.args.reviewer.toLowerCase() !== verified.address.toLowerCase()
    ) {
      return NextResponse.json({ error: 'On-chain approval does not match this application.' }, { status: 400 });
    }
  }

  const { data, error } = await supabase.from('tipjar_campaign_applications')
    .update({
      status: decision,
      review_note: reviewNote.trim(),
      review_tx_hash: decision === 'approved' ? (transactionHash as string).toLowerCase() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId).eq('status', 'pending').select().maybeSingle();
  if (error) {
    console.error('Campaign application review save failed:', error);
    return NextResponse.json({ error: 'Could not save this application review.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Application was already reviewed.' }, { status: 409 });
  return NextResponse.json(data);
}
