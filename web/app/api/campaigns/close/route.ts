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
  const { campaignId, transactionHash } = body;
  const payload = { campaignId };
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/close', payload, false, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;
  if (typeof campaignId !== 'string' || !UUID.test(campaignId) || typeof transactionHash !== 'string') {
    return NextResponse.json({ error: 'Campaign close details are invalid.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: campaign, error: campaignError } = await supabase.from('tipjar_campaigns')
    .select('id,escrow_campaign_id,creator_address,status')
    .eq('id', campaignId).single();
  if (campaignError || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  if (campaign.creator_address.toLowerCase() !== verified.address.toLowerCase()) {
    return NextResponse.json({ error: 'Only the project wallet can close this campaign.' }, { status: 403 });
  }

  const receipt = await getCampaignReceipt(transactionHash, verified.address);
  if (receipt instanceof NextResponse) return receipt;
  const event = findCampaignEvent(receipt.logs, 'CampaignClosed');
  if (
    !event || event.eventName !== 'CampaignClosed' ||
    event.args.campaignId.toLowerCase() !== campaign.escrow_campaign_id.toLowerCase() ||
    event.args.creator.toLowerCase() !== verified.address.toLowerCase()
  ) {
    return NextResponse.json({ error: 'Close transaction does not match this campaign.' }, { status: 400 });
  }

  const { data, error } = await supabase.from('tipjar_campaigns')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', campaignId).eq('status', 'open').select().maybeSingle();
  if (error) {
    console.error('Campaign close save failed:', error);
    return NextResponse.json({ error: 'Could not save campaign close state.' }, { status: 503 });
  }
  return NextResponse.json(data || { ...campaign, status: 'closed' });
}
