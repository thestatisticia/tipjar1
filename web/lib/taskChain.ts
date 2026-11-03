import { createPublicClient, defineChain, decodeEventLog, http, isAddress, type Hex, type Log, type TransactionReceipt } from 'viem';
import { NextResponse } from 'next/server';

const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
  blockExplorers: { default: { name: 'Celoscan', url: 'https://celoscan.io' } },
});

export const TASK_ESCROW_ABI = [
  {
    type: 'function',
    name: 'setAdmin',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'admin', type: 'address' },
      { name: 'enabled', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'createTask',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'taskId', type: 'bytes32' },
      { name: 'rewardPerCompletion', type: 'uint256' },
      { name: 'slots', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reserveSubmission',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submissionState',
    stateMutability: 'view',
    inputs: [
      { name: 'taskId', type: 'bytes32' },
      { name: 'worker', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'approveSubmission',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'taskId', type: 'bytes32' },
      { name: 'worker', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'rejectSubmission',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'taskId', type: 'bytes32' },
      { name: 'worker', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'closeTask',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'TaskCreated',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'rewardPerCompletion', type: 'uint256', indexed: false },
      { name: 'slots', type: 'uint32', indexed: false },
      { name: 'totalFunded', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SubmissionReserved',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RewardReleased',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
      { name: 'reviewer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SubmissionRejected',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
      { name: 'reviewer', type: 'address', indexed: true },
      { name: 'refunded', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TaskClosed',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'refunded', type: 'uint256', indexed: false },
    ],
  },
] as const;

export function getTaskEscrowAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_TASK_ESCROW_ADDRESS;
  return address && isAddress(address) ? address : null;
}

export async function getTaskReceipt(
  transactionHash: string,
  expectedSender: string,
): Promise<TransactionReceipt | NextResponse> {
  const escrowAddress = getTaskEscrowAddress();
  if (!escrowAddress) {
    return NextResponse.json({ error: 'Task escrow contract is not configured.' }, { status: 503 });
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash) || !isAddress(expectedSender)) {
    return NextResponse.json({ error: 'Invalid transaction details.' }, { status: 400 });
  }

  try {
    const publicClient = createPublicClient({ chain: celo, transport: http() });
    const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash as Hex });
    if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== escrowAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Escrow transaction was not successful.' }, { status: 400 });
    }
    if (receipt.from.toLowerCase() !== expectedSender.toLowerCase()) {
      return NextResponse.json({ error: 'Escrow transaction signer does not match the connected wallet.' }, { status: 403 });
    }
    return receipt;
  } catch (error) {
    console.error('Task escrow receipt lookup failed:', error);
    return NextResponse.json({ error: 'Could not verify the escrow transaction on Celo.' }, { status: 503 });
  }
}

export async function getTaskSubmissionState(taskId: `0x${string}`, worker: `0x${string}`) {
  const escrowAddress = getTaskEscrowAddress();
  if (!escrowAddress) {
    return NextResponse.json({ error: 'Task escrow contract is not configured.' }, { status: 503 });
  }

  try {
    const publicClient = createPublicClient({
      chain: celo,
      transport: http(process.env.GOODDOLLAR_RPC_URL || 'https://forno.celo.org'),
    });
    return await publicClient.readContract({
      address: escrowAddress,
      abi: TASK_ESCROW_ABI,
      functionName: 'submissionState',
      args: [taskId, worker],
    });
  } catch (error) {
    console.error('Task submission state lookup failed:', error);
    return NextResponse.json({ error: 'Could not verify your task reservation on Celo.' }, { status: 503 });
  }
}

export function decodeTaskEvent(log: { address: string; data: Hex; topics: readonly Hex[] }, eventName: string) {
  const escrowAddress = getTaskEscrowAddress();
  if (!escrowAddress || log.address.toLowerCase() !== escrowAddress.toLowerCase()) return null;
  try {
    const topics = [...log.topics] as [Hex, ...Hex[]];
    const parsed = decodeEventLog({ abi: TASK_ESCROW_ABI, data: log.data, topics, strict: true });
    return parsed.eventName === eventName ? parsed : null;
  } catch {
    return null;
  }
}

export function findTaskEvent(logs: readonly Log[], eventName: string) {
  for (const log of logs) {
    const parsed = decodeTaskEvent(log, eventName);
    if (parsed) return parsed;
  }
  return null;
}
