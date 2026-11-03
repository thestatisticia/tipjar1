import { isAddress } from 'viem';

export const ROCK_PAPER_SCISSORS_ABI = [
  {
    type: 'function',
    name: 'createGame',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'gameId', type: 'bytes32' },
      { name: 'stake', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'joinGame',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'gameId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'commitMove',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'gameId', type: 'bytes32' },
      { name: 'commitment', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revealMove',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'gameId', type: 'bytes32' },
      { name: 'move', type: 'uint8' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelWaitingGame',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'gameId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settleExpiredGame',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'gameId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getGame',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'bytes32' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'creator', type: 'address' },
        { name: 'opponent', type: 'address' },
        { name: 'stake', type: 'uint256' },
        { name: 'createdAt', type: 'uint64' },
        { name: 'commitDeadline', type: 'uint64' },
        { name: 'revealDeadline', type: 'uint64' },
        { name: 'creatorCommit', type: 'bytes32' },
        { name: 'opponentCommit', type: 'bytes32' },
        { name: 'creatorMove', type: 'uint8' },
        { name: 'opponentMove', type: 'uint8' },
        { name: 'state', type: 'uint8' },
        { name: 'creatorRevealed', type: 'bool' },
        { name: 'opponentRevealed', type: 'bool' },
      ],
    }],
  },
  {
    type: 'event',
    name: 'GameCreated',
    inputs: [
      { name: 'gameId', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'stake', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GameJoined',
    inputs: [
      { name: 'gameId', type: 'bytes32', indexed: true },
      { name: 'opponent', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MoveCommitted',
    inputs: [
      { name: 'gameId', type: 'bytes32', indexed: true },
      { name: 'player', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MoveRevealed',
    inputs: [
      { name: 'gameId', type: 'bytes32', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'move', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GameSettled',
    inputs: [
      { name: 'gameId', type: 'bytes32', indexed: true },
      { name: 'winner', type: 'address', indexed: true },
      { name: 'draw', type: 'bool', indexed: false },
      { name: 'payoutEach', type: 'uint256', indexed: false },
    ],
  },
] as const;

export function getRockPaperScissorsAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_RPS_ESCROW_ADDRESS;
  return address && isAddress(address) ? address : null;
}

export const ROCK_PAPER_SCISSORS_MOVES = ['Rock', 'Paper', 'Scissors'] as const;
export const ROCK_PAPER_SCISSORS_SCAN_BLOCKS = BigInt(50000);
export const ROCK_PAPER_SCISSORS_SCAN_BATCH = BigInt(2000);
