import { randomInt } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  decodeEventLog,
  parseAbiItem,
  parseUnits,
  type Address,
  type Hex,
  type Log,
} from 'viem';
import { ERC20_ABI, G_DOLLAR_ADDRESS } from '@/lib/contracts';
import { SPIN_OUTCOMES, type SpinOutcome } from '@/lib/spinWheelConfig';

export const SPIN_DAILY_CAP_G = 3000;
export const SPIN_UBI_SCAN_BLOCKS = BigInt(50000);
export const G_DOLLAR_PRIZES = [0, 10, 20, 50, 100, 200] as const;
const SPIN_OUTCOME_WEIGHTS = {
  zero: 30,
  good_luck: 25,
  '10_g': 20,
  '20_g': 15,
  '50_g': 7,
  '100_g': 2,
  '200_g': 1,
} as const;
const gDollarTransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const celo = defineChain({
  id: 42220,
  name: 'Celo',
  nativeCurrency: { decimals: 18, name: 'CELO', symbol: 'CELO' },
  rpcUrls: { default: { http: ['https://forno.celo.org'] } },
});

export class SpinPayoutSubmittedError extends Error {
  constructor(readonly transactionHash: Hex) {
    super('Payout was submitted, but its transaction hash could not be saved.');
    this.name = 'SpinPayoutSubmittedError';
  }
}

export function chooseSpinOutcome(): SpinOutcome {
  const totalWeight = Object.values(SPIN_OUTCOME_WEIGHTS).reduce((total, weight) => total + weight, 0);
  let roll = randomInt(totalWeight);
  for (const outcome of SPIN_OUTCOMES) {
    const weight = SPIN_OUTCOME_WEIGHTS[outcome.id];
    if (roll < weight) return outcome;
    roll -= weight;
  }
  throw new Error('Spin outcome weights are invalid.');
}

export function getSpinTreasuryAddress(): Address | null {
  const configuredKey = process.env.SPIN_REWARD_PRIVATE_KEY;
  if (!configuredKey) return null;

  const privateKey = configuredKey.startsWith('0x')
    ? configuredKey as Hex
    : `0x${configuredKey}` as Hex;
  return privateKeyToAccount(privateKey).address;
}

export async function sendSpinPayout(
  recipient: Address,
  prizeG: Exclude<(typeof G_DOLLAR_PRIZES)[number], 0>,
  onSubmitted: (transactionHash: Hex) => Promise<void>,
): Promise<Hex> {
  const configuredKey = process.env.SPIN_REWARD_PRIVATE_KEY;
  if (!configuredKey) {
    throw new Error('Spin reward treasury is not configured on the server.');
  }

  const privateKey = configuredKey.startsWith('0x')
    ? configuredKey as Hex
    : `0x${configuredKey}` as Hex;
  const account = privateKeyToAccount(privateKey);
  const transport = http(process.env.GOODDOLLAR_RPC_URL || 'https://forno.celo.org');
  const publicClient = createPublicClient({ chain: celo, transport });
  const walletClient = createWalletClient({ account, chain: celo, transport });
  const amount = parseUnits(String(prizeG), 18);

  const balance = await publicClient.readContract({
    address: G_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  if (balance < amount) {
    throw new Error('The spin reward treasury does not have enough G$ for this prize.');
  }

  const transactionHash = await walletClient.writeContract({
    address: G_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
  });
  try {
    await onSubmitted(transactionHash);
  } catch {
    throw new SpinPayoutSubmittedError(transactionHash);
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') {
    throw new Error(`Spin reward transfer failed on Celo: ${transactionHash}`);
  }
  const transferConfirmed = receipt.logs.some((log: Log) => {
    if (log.address.toLowerCase() !== G_DOLLAR_ADDRESS.toLowerCase()) return false;
    try {
      const event = decodeEventLog({
        abi: [gDollarTransferEvent],
        data: log.data,
        topics: log.topics,
      });
      return event.args.from.toLowerCase() === account.address.toLowerCase()
        && event.args.to.toLowerCase() === recipient.toLowerCase()
        && event.args.value === amount;
    } catch {
      return false;
    }
  });
  if (!transferConfirmed) {
    throw new Error(`Spin reward transfer was not confirmed by the G$ contract: ${transactionHash}`);
  }
  return transactionHash;
}
