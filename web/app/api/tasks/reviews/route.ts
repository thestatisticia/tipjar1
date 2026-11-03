import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { findTaskEvent, getTaskReceipt } from '@/lib/taskChain';
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
  const { submissionId, decision, reviewNote, transactionHash } = body;
  if (
    typeof submissionId !== 'string' || !UUID.test(submissionId) ||
    (decision !== 'approved' && decision !== 'rejected') ||
    typeof reviewNote !== 'string' || reviewNote.length > 1000 ||
    typeof transactionHash !== 'string'
  ) {
    return NextResponse.json({ error: 'Review details are invalid.' }, { status: 400 });
  }
  if (decision === 'rejected' && !reviewNote.trim()) {
    return NextResponse.json({ error: 'Add a reason when rejecting a submission.' }, { status: 400 });
  }
  const verified = await verifyTaskAuth(auth, 'POST', '/api/tasks/reviews', body, true);
  if (isAuthFailure(verified)) return verified;

  const supabase = createServerSupabaseClient();
  const { data: submission, error: submissionError } = await supabase
    .from('tipjar_task_submissions')
    .select('id,task_id,worker_address,status')
    .eq('id', submissionId)
    .single();
  if (submissionError || !submission) {
    return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
  }
  if (submission.status !== 'pending') {
    return NextResponse.json({ error: 'This submission has already been reviewed.' }, { status: 409 });
  }
  const { data: task, error: taskError } = await supabase
    .from('tipjar_tasks')
    .select('escrow_task_id,reward_per_completion')
    .eq('id', submission.task_id)
    .single();
  if (taskError || !task) {
    return NextResponse.json({ error: 'Task record not found.' }, { status: 404 });
  }

  const receipt = await getTaskReceipt(transactionHash, verified.address);
  if (receipt instanceof NextResponse) return receipt;
  const eventName = decision === 'approved' ? 'RewardReleased' : 'SubmissionRejected';
  const event = findTaskEvent(receipt.logs, eventName);
  if (!event || event.args.taskId.toLowerCase() !== task.escrow_task_id.toLowerCase()) {
    return NextResponse.json({ error: 'Review transaction does not match this submission.' }, { status: 400 });
  }
  if (decision === 'approved') {
    if (
      event.eventName !== 'RewardReleased' ||
      event.args.worker.toLowerCase() !== submission.worker_address.toLowerCase() ||
      event.args.reviewer.toLowerCase() !== verified.address.toLowerCase() ||
      event.args.amount !== BigInt(task.reward_per_completion)
    ) {
      return NextResponse.json({ error: 'Review transaction does not match this submission.' }, { status: 400 });
    }
  } else if (
    event.eventName !== 'SubmissionRejected' ||
    event.args.worker.toLowerCase() !== submission.worker_address.toLowerCase() ||
    event.args.reviewer.toLowerCase() !== verified.address.toLowerCase()
  ) {
    return NextResponse.json({ error: 'Review transaction does not match this submission.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tipjar_task_submissions')
    .update({
      status: decision,
      review_note: reviewNote.trim(),
      review_tx_hash: transactionHash.toLowerCase(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) {
    console.error('Task review update failed:', error);
    return NextResponse.json({ error: 'Could not save the review result.' }, { status: 503 });
  }
  if (!data) {
    return NextResponse.json({ error: 'This submission has already been reviewed.' }, { status: 409 });
  }
  return NextResponse.json(data);
}
