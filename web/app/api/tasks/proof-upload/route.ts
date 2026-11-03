import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isAuthFailure, verifyTaskAuth, type TaskAuth } from '@/lib/taskSecurity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  const taskId = form.get('taskId');
  const nonce = form.get('nonce');
  const issuedAt = form.get('issuedAt');
  const address = form.get('address');
  const signature = form.get('signature');

  if (
    !(file instanceof File) ||
    typeof taskId !== 'string' || !UUID.test(taskId) ||
    typeof nonce !== 'string' ||
    typeof issuedAt !== 'string' ||
    typeof address !== 'string' ||
    typeof signature !== 'string'
  ) {
    return NextResponse.json({ error: 'Screenshot upload details are invalid.' }, { status: 400 });
  }
  if (!MIME_EXTENSIONS[file.type] || file.size === 0 || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, or WebP screenshot up to 5 MB.' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (
    (file.type === 'image/jpeg' && !isJpeg) ||
    (file.type === 'image/png' && !isPng) ||
    (file.type === 'image/webp' && !isWebp)
  ) {
    return NextResponse.json({ error: 'The screenshot contents do not match the selected image type.' }, { status: 400 });
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const auth: TaskAuth = { address, nonce, issuedAt, signature: signature as `0x${string}` };
  const payload = {
    taskId,
    fileName: file.name.slice(-120),
    contentType: file.type,
    sha256,
  };
  const verified = await verifyTaskAuth(
    auth,
    'POST',
    '/api/tasks/proof-upload',
    payload,
  );
  if (isAuthFailure(verified)) return verified;

  const supabase = createServerSupabaseClient();
  const { data: task, error: taskError } = await supabase
    .from('tipjar_tasks')
    .select('id,creator_address,status')
    .eq('id', taskId)
    .single();
  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (task.status !== 'open' || task.creator_address.toLowerCase() === verified.address.toLowerCase()) {
    return NextResponse.json({ error: 'This task is not accepting a proof from this wallet.' }, { status: 403 });
  }

  const path = `${taskId}/${verified.address.toLowerCase()}/${nonce}.${MIME_EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from('tipjar-task-proofs')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) {
    console.error('Task screenshot upload failed:', error);
    return NextResponse.json({ error: 'Could not store the screenshot.' }, { status: 503 });
  }
  return NextResponse.json({ path });
}
