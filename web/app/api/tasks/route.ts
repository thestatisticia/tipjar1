import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { findTaskEvent, getTaskReceipt } from '@/lib/taskChain';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Task storage is not configured on the server.' }, { status: 503 });
  }
  const supabase = createServerSupabaseClient();
  const taskId = request.nextUrl.searchParams.get('taskId');
  const now = new Date().toISOString();
  let taskQuery = supabase
    .from('tipjar_tasks')
    .select('id,escrow_task_id,creator_address,title,description,requirements,reward_per_completion,slots,status,created_at,duration_days,expires_at')
    .eq('status', 'open')
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (taskId) taskQuery = taskQuery.eq('id', taskId);
  const { data, error } = await taskQuery
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('Task listing failed:', error);
    const missingExpiryColumn = error.code === 'PGRST204' || error.code === '42703';
    return NextResponse.json(
      {
        error: missingExpiryColumn
          ? 'Task expiry is not configured in the database. Apply web/supabase/migrations/202611010002_task_campaign_expiry.sql in Supabase.'
          : error.code === 'PGRST205' || error.code === '42P01'
          ? 'Task database tables are missing. Apply web/supabase/migrations/202610280001_tasks.sql in Supabase.'
          : 'Could not load tasks.',
      },
      { status: 503 },
    );
  }
  if (taskId && !data?.length) {
    return NextResponse.json({ error: 'This task has expired, closed, or filled all available slots.' }, { status: 409 });
  }
  if (!data?.length) return NextResponse.json([]);

  const { data: reservations, error: reservationsError } = await supabase
    .from('tipjar_task_submissions')
    .select('task_id')
    .in('task_id', data.map((task) => task.id))
    .in('status', ['pending', 'approved']);
  if (reservationsError) {
    console.error('Task reservation counts failed:', reservationsError);
    return NextResponse.json(
      {
        error: reservationsError.code === 'PGRST205' || reservationsError.code === '42P01'
          ? 'Task database tables are missing. Apply web/supabase/migrations/202610280001_tasks.sql in Supabase.'
          : 'Could not load available task slots.',
      },
      { status: 503 },
    );
  }

  const reservedByTask = new Map<string, number>();
  for (const submission of reservations || []) {
    reservedByTask.set(submission.task_id, (reservedByTask.get(submission.task_id) || 0) + 1);
  }
  const tasks = data.map((task) => {
    const claimedSlots = reservedByTask.get(task.id) || 0;
    return {
      ...task,
      total_slots: task.slots,
      claimed_slots: claimedSlots,
      slots: Math.max(0, task.slots - claimedSlots),
    };
  });
  if (taskId) {
    const task = tasks[0];
    return task.slots > 0
      ? NextResponse.json(task)
      : NextResponse.json({ error: 'This task has no available slots.' }, { status: 409 });
  }
  return NextResponse.json(tasks.filter((task) => task.slots > 0));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const auth = body.auth as TaskAuth | undefined;
  const payload = { ...body, auth: undefined };
  const verified = await verifyTaskAuth(auth, 'POST', '/api/tasks', payload);
  if (isAuthFailure(verified)) return verified;

  const { id, escrowTaskId, title, description, requirements, rewardPerCompletion, slots, durationDays, transactionHash } = body;
  if (
    typeof id !== 'string' || !UUID.test(id) ||
    typeof escrowTaskId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(escrowTaskId) ||
    typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 100 ||
    typeof description !== 'string' || !description.trim() || description.length > 2000 ||
    typeof requirements !== 'string' || !requirements.trim() || requirements.length > 2000 ||
    typeof rewardPerCompletion !== 'string' || !/^[1-9]\d*$/.test(rewardPerCompletion) ||
    !Number.isInteger(slots) || Number(slots) < 1 || Number(slots) > 1000 ||
    !Number.isInteger(durationDays) || Number(durationDays) < 1 || Number(durationDays) > 365 ||
    typeof transactionHash !== 'string'
  ) {
    return NextResponse.json({ error: 'Task details are missing or invalid.' }, { status: 400 });
  }

  const receipt = await getTaskReceipt(transactionHash, verified.address);
  if (receipt instanceof NextResponse) return receipt;
  const event = findTaskEvent(receipt.logs, 'TaskCreated');
  if (
    !event || event.eventName !== 'TaskCreated' ||
    event.args.taskId.toLowerCase() !== escrowTaskId.toLowerCase() ||
    event.args.creator.toLowerCase() !== verified.address.toLowerCase() ||
    event.args.rewardPerCompletion !== BigInt(rewardPerCompletion) ||
    event.args.slots !== Number(slots)
  ) {
    return NextResponse.json({ error: 'Escrow transaction does not match these task details.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from('tipjar_tasks').insert({
    id,
    escrow_task_id: escrowTaskId.toLowerCase(),
    creator_address: verified.address.toLowerCase(),
    title: title.trim(),
    description: description.trim(),
    requirements: requirements.trim(),
    reward_per_completion: rewardPerCompletion,
    slots,
    duration_days: durationDays,
    expires_at: new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000).toISOString(),
    escrow_tx_hash: transactionHash.toLowerCase(),
    status: 'open',
  }).select().single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This escrowed task is already registered.' }, { status: 409 });
    }
    console.error('Task creation failed:', error);
    return NextResponse.json({
      error: error.code === 'PGRST204' || error.code === '42703'
        ? 'Task expiry is not configured in the database. Apply web/supabase/migrations/202611010002_task_campaign_expiry.sql in Supabase.'
        : 'Could not save this task.',
    }, { status: 503 });
  }
  return NextResponse.json(data, { status: 201 });
}
