import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  isAddress,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { NextResponse } from 'next/server';

const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
  blockExplorers: { default: { name: 'Celoscan', url: 'https://celoscan.io' } },
});

export const CAMPAIGN_ESCROW_ABI = [
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
    name: 'createCampaign',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'budget', type: 'uint256' },
      { name: 'maxParticipants', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approveParticipant',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'participant', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'payParticipant',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'bytes32' },
      { name: 'participant', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'closeCampaign',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'campaignId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'CampaignCreated',
    inputs: [
      { name: 'campaignId', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'budget', type: 'uint256', indexed: false },
      { name: 'rewardPerParticipant', type: 'uint256', indexed: false },
      { name: 'maxParticipants', type: 'uint32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ParticipantApproved',
    inputs: [
      { name: 'campaignId', type: 'bytes32', indexed: true },
      { name: 'participant', type: 'address', indexed: true },
      { name: 'reviewer', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RewardPaid',
    inputs: [
      { name: 'campaignId', type: 'bytes32', indexed: true },
      { name: 'participant', type: 'address', indexed: true },
      { name: 'reviewer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CampaignClosed',
    inputs: [
      { name: 'campaignId', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'refunded', type: 'uint256', indexed: false },
    ],
  },
] as const;

export function getCampaignEscrowAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_CAMPAIGN_ESCROW_ADDRESS;
  return address && isAddress(address) ? address : null;
}

export async function getCampaignReceipt(
  transactionHash: string,
  expectedSender: string,
): Promise<TransactionReceipt | NextResponse> {
  const escrowAddress = getCampaignEscrowAddress();
  if (!escrowAddress) {
    return NextResponse.json({ error: 'Campaign escrow is not configured.' }, { status: 503 });
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash) || !isAddress(expectedSender)) {
    return NextResponse.json({ error: 'Invalid transaction details.' }, { status: 400 });
  }

  try {
    const client = createPublicClient({ chain: celo, transport: http() });
    const receipt = await client.getTransactionReceipt({ hash: transactionHash as Hex });
    if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== escrowAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Campaign escrow transaction was not successful.' }, { status: 400 });
    }
    if (receipt.from.toLowerCase() !== expectedSender.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction signer does not match the connected wallet.' }, { status: 403 });
    }
    return receipt;
  } catch (error) {
    console.error('Campaign escrow receipt lookup failed:', error);
    return NextResponse.json({ error: 'Could not verify campaign transaction on Celo.' }, { status: 503 });
  }
}

export function findCampaignEvent(logs: readonly Log[], eventName: string) {
  const escrowAddress = getCampaignEscrowAddress();
  if (!escrowAddress) return null;
  for (const log of logs) {
    if (log.address.toLowerCase() !== escrowAddress.toLowerCase()) continue;
    try {
      const parsed = decodeEventLog({
        abi: CAMPAIGN_ESCROW_ABI,
        data: log.data,
        topics: [...log.topics] as [Hex, ...Hex[]],
        strict: true,
      });
      if (parsed.eventName === eventName) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
