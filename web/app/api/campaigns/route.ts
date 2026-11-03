import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { findCampaignEvent, getCampaignReceipt } from '@/lib/campaignChain';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Campaign storage is not configured on the server.' }, { status: 503 });
  }
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const { data: campaigns, error } = await supabase
    .from('tipjar_campaigns')
    .select('id,escrow_campaign_id,creator_address,title,description,requirements,budget,reward_per_participant,max_participants,status,created_at,duration_days,expires_at')
    .eq('status', 'open')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('Campaign listing failed:', error);
    return NextResponse.json({
      error: error.code === 'PGRST204' || error.code === '42703'
        ? 'Campaign expiry is not configured in the database. Apply web/supabase/migrations/202611010002_task_campaign_expiry.sql in Supabase.'
        : 'Could not load campaigns.',
    }, { status: 503 });
  }
  if (!campaigns?.length) return NextResponse.json([]);

  const { data: applications, error: applicationsError } = await supabase
    .from('tipjar_campaign_applications')
    .select('campaign_id,status')
    .in('campaign_id', campaigns.map((campaign) => campaign.id))
    .in('status', ['approved', 'completed']);
  if (applicationsError) {
    console.error('Campaign participant counts failed:', applicationsError);
    return NextResponse.json({ error: 'Could not load campaign participant availability.' }, { status: 503 });
  }
  const participants = new Map<string, number>();
  for (const application of applications || []) {
    participants.set(application.campaign_id, (participants.get(application.campaign_id) || 0) + 1);
  }
  return NextResponse.json(campaigns.map((campaign) => ({
    ...campaign,
    available_participants: Math.max(0, campaign.max_participants - (participants.get(campaign.id) || 0)),
  })));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const auth = body.auth as TaskAuth | undefined;
  const { transactionHash: submittedTransactionHash, ...payload } = body;
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns', payload, false, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;

  const { id, escrowCampaignId, title, description, requirements, budget, maxParticipants, durationDays } = body;
  if (
    typeof id !== 'string' || !UUID.test(id) ||
    typeof escrowCampaignId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(escrowCampaignId) ||
    typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 100 ||
    typeof description !== 'string' || !description.trim() || description.length > 2000 ||
    typeof requirements !== 'string' || !requirements.trim() || requirements.length > 2000 ||
    typeof budget !== 'string' || !/^[1-9]\d*$/.test(budget) ||
    !Number.isInteger(maxParticipants) || Number(maxParticipants) < 1 || Number(maxParticipants) > 10000 ||
    !Number.isInteger(durationDays) || Number(durationDays) < 1 || Number(durationDays) > 365 ||
    typeof submittedTransactionHash !== 'string'
  ) {
    return NextResponse.json({ error: 'Campaign details are missing or invalid.' }, { status: 400 });
  }

  const receipt = await getCampaignReceipt(submittedTransactionHash, verified.address);
  if (receipt instanceof NextResponse) return receipt;
  const event = findCampaignEvent(receipt.logs, 'CampaignCreated');
  if (
    !event || event.eventName !== 'CampaignCreated' ||
    event.args.campaignId.toLowerCase() !== escrowCampaignId.toLowerCase() ||
    event.args.creator.toLowerCase() !== verified.address.toLowerCase() ||
    event.args.budget !== BigInt(budget) ||
    event.args.maxParticipants !== Number(maxParticipants)
  ) {
    return NextResponse.json({ error: 'Escrow transaction does not match these campaign details.' }, { status: 400 });
  }

  const { data, error } = await createServerSupabaseClient().from('tipjar_campaigns').insert({
    id,
    escrow_campaign_id: escrowCampaignId.toLowerCase(),
    creator_address: verified.address.toLowerCase(),
    title: title.trim(),
    description: description.trim(),
    requirements: requirements.trim(),
    budget,
    reward_per_participant: event.args.rewardPerParticipant.toString(),
    max_participants: maxParticipants,
    duration_days: durationDays,
    expires_at: new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000).toISOString(),
    escrow_tx_hash: submittedTransactionHash.toLowerCase(),
    status: 'open',
  }).select().single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This escrowed campaign is already registered.' }, { status: 409 });
    console.error('Campaign creation failed:', error);
    return NextResponse.json({
      error: error.code === 'PGRST204' || error.code === '42703'
        ? 'Campaign expiry is not configured in the database. Apply web/supabase/migrations/202611010002_task_campaign_expiry.sql in Supabase.'
        : 'Could not save this campaign.',
    }, { status: 503 });
  }
  return NextResponse.json(data, { status: 201 });
}
