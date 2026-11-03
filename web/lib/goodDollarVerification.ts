import { createPublicClient, defineChain, http, isAddress, zeroAddress } from 'viem';

const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
});

const IDENTITY_ADDRESS = '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42';
const IDENTITY_ABI = [{
  type: 'function',
  name: 'getWhitelistedRoot',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: 'whitelisted', type: 'address' }],
}] as const;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.GOODDOLLAR_RPC_URL || 'https://forno.celo.org'),
});

export class GoodDollarVerificationUnavailableError extends Error {
  constructor() {
    super('Could not reach GoodDollar Identity on Celo. Please retry shortly.');
    this.name = 'GoodDollarVerificationUnavailableError';
  }
}

export async function getGoodDollarVerifiedRootAddress(address: string): Promise<`0x${string}` | null> {
  if (!address || !isAddress(address)) return null;

  try {
    const root = await publicClient.readContract({
      address: IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: 'getWhitelistedRoot',
      args: [address],
    });
    return root === zeroAddress ? null : root;
  } catch (error) {
    console.error('GoodDollar Identity check failed:', error);
    throw new GoodDollarVerificationUnavailableError();
  }
}

export async function isGoodDollarVerifiedAddress(address: string): Promise<boolean> {
  return (await getGoodDollarVerifiedRootAddress(address)) !== null;
}
