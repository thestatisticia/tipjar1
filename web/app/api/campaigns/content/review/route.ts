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
  const { contentId, decision, reviewNote, transactionHash = null } = body;
  const payload = { contentId, decision, reviewNote };
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/content/review', payload, true, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;
  if (typeof contentId !== 'string' || !UUID.test(contentId) ||
      (decision !== 'approved' && decision !== 'rejected') ||
      typeof reviewNote !== 'string' || reviewNote.length > 1000 ||
      (decision === 'approved' && typeof transactionHash !== 'string') ||
      (decision === 'rejected' && !reviewNote.trim())) {
    return NextResponse.json({ error: 'Content review details are invalid.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: content, error: contentError } = await supabase.from('tipjar_campaign_content')
    .select('id,application_id,status').eq('id', contentId).single();
  if (contentError || !content) return NextResponse.json({ error: 'Content submission not found.' }, { status: 404 });
  if (content.status !== 'pending') return NextResponse.json({ error: 'Content was already reviewed.' }, { status: 409 });
  const { data: application, error: applicationError } = await supabase.from('tipjar_campaign_applications')
    .select('id,campaign_id,participant_address,status').eq('id', content.application_id).single();
  if (applicationError || !application) return NextResponse.json({ error: 'Campaign application not found.' }, { status: 404 });
  if (application.status !== 'approved') return NextResponse.json({ error: 'Participant is not awaiting content approval.' }, { status: 409 });
  const { data: campaign, error: campaignError } = await supabase.from('tipjar_campaigns')
    .select('escrow_campaign_id,reward_per_participant').eq('id', application.campaign_id).single();
  if (campaignError || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  if (decision === 'approved') {
    const receipt = await getCampaignReceipt(transactionHash as string, verified.address);
    if (receipt instanceof NextResponse) return receipt;
    const event = findCampaignEvent(receipt.logs, 'RewardPaid');
    if (
      !event || event.eventName !== 'RewardPaid' ||
      event.args.campaignId.toLowerCase() !== campaign.escrow_campaign_id.toLowerCase() ||
      event.args.participant.toLowerCase() !== application.participant_address.toLowerCase() ||
      event.args.reviewer.toLowerCase() !== verified.address.toLowerCase() ||
      event.args.amount !== BigInt(campaign.reward_per_participant)
    ) {
      return NextResponse.json({ error: 'On-chain payout does not match this content submission.' }, { status: 400 });
    }
  }

  const { data, error } = await supabase.from('tipjar_campaign_content')
    .update({
      status: decision,
      review_note: reviewNote.trim(),
      review_tx_hash: decision === 'approved' ? (transactionHash as string).toLowerCase() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentId).eq('status', 'pending').select().maybeSingle();
  if (error) {
    console.error('Campaign content review save failed:', error);
    return NextResponse.json({ error: 'Could not save the content review.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Content was already reviewed.' }, { status: 409 });

  if (decision === 'approved') {
    const { error: completionError } = await supabase.from('tipjar_campaign_applications')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', application.id).eq('status', 'approved');
    if (completionError) {
      console.error('Campaign payout recorded but application completion sync failed:', completionError);
      return NextResponse.json({ error: 'Payout completed on-chain, but campaign status needs administrator reconciliation.' }, { status: 503 });
    }
  }
  return NextResponse.json(data);
}
