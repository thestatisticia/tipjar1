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
  const verified = await verifyTaskAuth(auth, 'POST', '/api/tasks/close', body);
  if (isAuthFailure(verified)) return verified;

  const { taskId, transactionHash } = body;
  if (typeof taskId !== 'string' || !UUID.test(taskId) || typeof transactionHash !== 'string') {
    return NextResponse.json({ error: 'Task close details are invalid.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: task, error: taskError } = await supabase
    .from('tipjar_tasks')
    .select('id,escrow_task_id,creator_address,status')
    .eq('id', taskId)
    .single();
  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (task.creator_address.toLowerCase() !== verified.address.toLowerCase()) {
    return NextResponse.json({ error: 'Only the task creator can close it.' }, { status: 403 });
  }

  const receipt = await getTaskReceipt(transactionHash, verified.address);
  if (receipt instanceof NextResponse) return receipt;
  const event = findTaskEvent(receipt.logs, 'TaskClosed');
  if (
    !event || event.eventName !== 'TaskClosed' ||
    event.args.taskId.toLowerCase() !== task.escrow_task_id.toLowerCase() ||
    event.args.creator.toLowerCase() !== verified.address.toLowerCase()
  ) {
    return NextResponse.json({ error: 'Close transaction does not match this task.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tipjar_tasks')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'open')
    .select()
    .maybeSingle();
  if (error) {
    console.error('Task close update failed:', error);
    return NextResponse.json({ error: 'Could not save the closed task state.' }, { status: 503 });
  }
  return NextResponse.json(data || { ...task, status: 'closed' });
}
