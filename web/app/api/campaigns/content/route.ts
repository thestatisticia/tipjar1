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
  const { applicationId, contentUrl } = body;
  const payload = { applicationId, contentUrl };
  const verified = await verifyTaskAuth(auth, 'POST', '/api/campaigns/content', payload, false, 'tipjar_campaign_auth_nonces');
  if (isAuthFailure(verified)) return verified;

  if (typeof applicationId !== 'string' || !UUID.test(applicationId) || typeof contentUrl !== 'string' || contentUrl.length > 2048) {
    return NextResponse.json({ error: 'Content submission details are invalid.' }, { status: 400 });
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(contentUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported URL protocol.');
  } catch {
    return NextResponse.json({ error: 'Provide a valid http or https content link.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: application, error: applicationError } = await supabase
    .from('tipjar_campaign_applications')
    .select('id,participant_address,status')
    .eq('id', applicationId)
    .single();
  if (applicationError || !application) return NextResponse.json({ error: 'Campaign application not found.' }, { status: 404 });
  if (application.participant_address.toLowerCase() !== verified.address.toLowerCase()) {
    return NextResponse.json({ error: 'Only the applicant can submit campaign content.' }, { status: 403 });
  }
  if (application.status !== 'approved') return NextResponse.json({ error: 'Content submission requires an approved application.' }, { status: 409 });

  const { data: existing, error: existingError } = await supabase
    .from('tipjar_campaign_content')
    .select('id,status')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (existingError) {
    console.error('Campaign content lookup failed:', existingError);
    return NextResponse.json({ error: 'Could not check previous submissions.' }, { status: 503 });
  }
  if (existing && existing.status !== 'rejected') {
    return NextResponse.json({ error: 'Content is already awaiting review or has been approved.' }, { status: 409 });
  }

  const result = existing
    ? await supabase.from('tipjar_campaign_content').update({
      content_url: parsedUrl.toString(),
      status: 'pending',
      review_note: '',
      review_tx_hash: null,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).eq('status', 'rejected').select().single()
    : await supabase.from('tipjar_campaign_content').insert({
      application_id: applicationId,
      content_url: parsedUrl.toString(),
    }).select().single();

  if (result.error) {
    console.error('Campaign content submission failed:', result.error);
    return NextResponse.json({ error: 'Could not save this content link.' }, { status: 503 });
  }
  return NextResponse.json(result.data, { status: existing ? 200 : 201 });
}
