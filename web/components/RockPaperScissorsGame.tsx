'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  FileText,
  Hand,
  Loader2,
  Scissors,
  ShieldCheck,
  Swords,
  Wallet,
} from 'lucide-react';
import {
  encodePacked,
  formatUnits,
  getAddress,
  keccak256,
  parseAbiItem,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { ERC20_ABI, G_DOLLAR_ADDRESS } from '@/lib/contracts';
import {
  getRockPaperScissorsAddress,
  ROCK_PAPER_SCISSORS_ABI,
  ROCK_PAPER_SCISSORS_MOVES,
  ROCK_PAPER_SCISSORS_SCAN_BATCH,
  ROCK_PAPER_SCISSORS_SCAN_BLOCKS,
} from '@/lib/rpsGame';

const GAME_STATES = { waiting: 1, playing: 2, settled: 3, cancelled: 4 } as const;
const MOVE_ICONS = [Hand, FileText, Scissors] as const;
const COMMITMENT_STORAGE_PREFIX = 'tipjar-rps-commitment';
const PRACTICE_MOVES = [
  { name: 'Rock', gesture: '✊' },
  { name: 'Paper', gesture: '✋' },
  { name: 'Scissors', gesture: '✌️' },
] as const;

type PracticePhase = 'lobby' | 'choosing' | 'revealing' | 'result';

function PracticeArena() {
  const [phase, setPhase] = useState<PracticePhase>('lobby');
  const [playerMove, setPlayerMove] = useState<number | null>(null);
  const [opponentMove, setOpponentMove] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== 'revealing') return;

    const timer = window.setTimeout(() => {
      setOpponentMove(Math.floor(Math.random() * PRACTICE_MOVES.length));
      setPhase('result');
    }, 900);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const enterArena = () => {
    setPlayerMove(null);
    setOpponentMove(null);
    setPhase('choosing');
  };

  const chooseMove = (move: number) => {
    setPlayerMove(move);
    setPhase('revealing');
  };

  const playerWins = playerMove !== null &&
    opponentMove !== null &&
    (playerMove - opponentMove + PRACTICE_MOVES.length) % PRACTICE_MOVES.length === 1;
  const isDraw = playerMove !== null && playerMove === opponentMove;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Practice · no G$ at stake</p>
          <h3 className="mt-1 font-display text-xl font-bold">Enter the arena</h3>
        </div>
        {phase === 'lobby' ? (
          <button
            type="button"
            onClick={enterArena}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Swords size={16} />
            Enter the arena
          </button>
        ) : (
          <button
            type="button"
            onClick={enterArena}
            className="h-9 rounded-lg border border-line px-3 text-xs font-bold transition-colors hover:bg-muted"
          >
            {phase === 'result' ? 'Play again' : 'Restart round'}
          </button>
        )}
      </div>

      {phase !== 'lobby' && (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {[{
              title: 'You',
              move: playerMove,
              outcome: phase === 'result' ? (isDraw ? 'DRAW' : playerWins ? 'YOU WIN!' : 'YOU LOST') : '',
              outcomeClass: playerWins ? 'text-success' : isDraw ? 'text-muted-foreground' : 'text-danger',
            }, {
              title: 'Arena bot',
              move: opponentMove,
              outcome: phase === 'result' ? (isDraw ? 'DRAW' : playerWins ? 'LOST' : 'BOT WINS') : '',
              outcomeClass: playerWins ? 'text-danger' : isDraw ? 'text-muted-foreground' : 'text-success',
            }].map((side) => (
              <div key={side.title} className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-line bg-background p-3 text-center sm:min-h-40">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{side.title}</p>
                <span aria-label={side.move === null ? 'Move hidden' : PRACTICE_MOVES[side.move].name} className="mt-1 text-5xl sm:text-6xl">
                  {side.move === null || (side.title === 'Arena bot' && phase === 'revealing')
                    ? '❔'
                    : PRACTICE_MOVES[side.move].gesture}
                </span>
                {side.outcome && <p className={`mt-2 text-sm font-extrabold ${side.outcomeClass}`}>{side.outcome}</p>}
              </div>
            ))}
          </div>

          {phase === 'choosing' && (
            <div className="mt-5">
              <p className="text-center text-sm font-semibold">Choose your hand sign</p>
              <div className="mx-auto mt-3 grid max-w-lg grid-cols-3 gap-2">
                {PRACTICE_MOVES.map((move, index) => (
                  <button
                    key={move.name}
                    type="button"
                    onClick={() => chooseMove(index)}
                    className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-background text-foreground transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span aria-hidden="true" className="text-4xl">{move.gesture}</span>
                    <span className="text-xs font-bold">{move.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {phase === 'revealing' && (
            <p role="status" className="mt-5 text-center text-sm font-semibold text-muted-foreground">
              The arena bot has chosen. Revealing both moves…
            </p>
          )}
          {phase === 'result' && (
            <p role="status" className="mt-5 text-center text-lg font-extrabold">
              {isDraw ? 'It’s a draw! Run it back?' : playerWins ? 'Congratulations, you won!' : 'You lost this round. Try again!'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface CommitmentRecord {
  move: number;
  salt: Hex;
}

interface RpsGame {
  id: Hex;
  creator: Address;
  opponent: Address;
  stake: bigint;
  state: number;
  commitDeadline: bigint;
  revealDeadline: bigint;
  creatorCommit: Hex;
  opponentCommit: Hex;
  creatorMove: number;
  opponentMove: number;
  creatorRevealed: boolean;
  opponentRevealed: boolean;
}

interface RpsGameList {
  openGames: RpsGame[];
  myGames: RpsGame[];
}

function commitmentStorageKey(gameId: Hex, address: Address) {
  return `${COMMITMENT_STORAGE_PREFIX}:${gameId.toLowerCase()}:${address.toLowerCase()}`;
}

function getCommitment(gameId: Hex, address: Address): CommitmentRecord | null {
  try {
    const stored = window.localStorage.getItem(commitmentStorageKey(gameId, address));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'move' in parsed &&
      typeof parsed.move === 'number' &&
      Number.isInteger(parsed.move) &&
      parsed.move >= 0 &&
      parsed.move <= 2 &&
      'salt' in parsed &&
      typeof parsed.salt === 'string' &&
      /^0x[0-9a-f]{64}$/i.test(parsed.salt)
    ) {
      return { move: parsed.move, salt: parsed.salt as Hex };
    }
    return null;
  } catch {
    return null;
  }
}

function createSalt(): Hex {
  return `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function loadGames(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  contractAddress: Address,
  account: Address,
): Promise<RpsGameList> {
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock > ROCK_PAPER_SCISSORS_SCAN_BLOCKS
    ? currentBlock - ROCK_PAPER_SCISSORS_SCAN_BLOCKS
    : BigInt(0);
  const createdLogs = [];
  const joinedLogs = [];

  for (let start = fromBlock; start <= currentBlock; start += ROCK_PAPER_SCISSORS_SCAN_BATCH) {
    const end = start + ROCK_PAPER_SCISSORS_SCAN_BATCH - BigInt(1) > currentBlock
      ? currentBlock
      : start + ROCK_PAPER_SCISSORS_SCAN_BATCH - BigInt(1);
    const [created, joined] = await Promise.all([
      publicClient.getLogs({
        address: contractAddress,
        event: parseAbiItem('event GameCreated(bytes32 indexed gameId, address indexed creator, uint256 stake)'),
        fromBlock: start,
        toBlock: end,
      }),
      publicClient.getLogs({
        address: contractAddress,
        event: parseAbiItem('event GameJoined(bytes32 indexed gameId, address indexed opponent)'),
        args: { opponent: account },
        fromBlock: start,
        toBlock: end,
      }),
    ]);
    createdLogs.push(...created);
    joinedLogs.push(...joined);
  }

  const uniqueGameIds = Array.from(new Set([
    ...createdLogs.slice(-100).map((log) => log.args.gameId).filter((id): id is Hex => Boolean(id)),
    ...createdLogs
      .filter((log) => log.args.creator?.toLowerCase() === account.toLowerCase())
      .map((log) => log.args.gameId)
      .filter((id): id is Hex => Boolean(id)),
    ...joinedLogs.map((log) => log.args.gameId).filter((id): id is Hex => Boolean(id)),
  ]));
  const games = await Promise.all(uniqueGameIds.map(async (id) => {
    const game = await publicClient.readContract({
      address: contractAddress,
      abi: ROCK_PAPER_SCISSORS_ABI,
      functionName: 'getGame',
      args: [id],
    });
    return {
      id,
      creator: game.creator,
      opponent: game.opponent,
      stake: game.stake,
      state: game.state,
      commitDeadline: game.commitDeadline,
      revealDeadline: game.revealDeadline,
      creatorCommit: game.creatorCommit,
      opponentCommit: game.opponentCommit,
      creatorMove: game.creatorMove,
      opponentMove: game.opponentMove,
      creatorRevealed: game.creatorRevealed,
      opponentRevealed: game.opponentRevealed,
    } satisfies RpsGame;
  }));
  const openIds = new Set(createdLogs.slice(-100).map((log) => log.args.gameId?.toLowerCase()));

  return {
    openGames: games
      .filter((game) =>
        game.state === GAME_STATES.waiting &&
        game.creator.toLowerCase() !== account.toLowerCase() &&
        openIds.has(game.id.toLowerCase()))
      .reverse()
      .slice(0, 20),
    myGames: games
      .filter((game) =>
        game.state === GAME_STATES.playing ||
        (game.state === GAME_STATES.waiting && game.creator.toLowerCase() === account.toLowerCase()))
      .reverse(),
  };
}

export default function RockPaperScissorsGame() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: 42220 });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const contractAddress = getRockPaperScissorsAddress();
  const [mode, setMode] = useState<'free' | 'stake'>('free');
  const [stake, setStake] = useState('');
  const [selectedMove, setSelectedMove] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const gamesQuery = useQuery({
    queryKey: ['rps-games', contractAddress, address],
    enabled: Boolean(contractAddress && address && publicClient),
    refetchInterval: 15000,
    queryFn: () => loadGames(publicClient!, contractAddress!, getAddress(address!)),
  });
  const games = gamesQuery.data ?? { openGames: [], myGames: [] };
  const hasCelo = chainId === 42220;

  const ensureCelo = async () => {
    if (chainId !== 42220) await switchChainAsync({ chainId: 42220 });
  };

  const waitForTransaction = async (hash: Hex) => {
    if (!publicClient) throw new Error('Celo RPC is unavailable. Reconnect your wallet and retry.');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Transaction failed: ${hash}`);
  };

  const submit = async (
    label: string,
    action: () => Promise<Hex>,
    successMessage: string,
  ) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await ensureCelo();
      const hash = await action();
      await waitForTransaction(hash);
      setNotice(successMessage);
      await gamesQuery.refetch();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The game action failed.');
    } finally {
      setBusy('');
    }
  };

  const createMatch = async () => {
    if (!address || !contractAddress) return;
    let stakeUnits = BigInt(0);
    if (mode === 'stake') {
      try {
        stakeUnits = parseUnits(stake, 18);
      } catch {
        setError('Enter a valid G$ stake amount.');
        return;
      }
      if (stakeUnits <= BigInt(0)) {
        setError('Enter a G$ amount greater than zero, or choose free play.');
        return;
      }
    }
    const gameId = keccak256(stringToHex(crypto.randomUUID()));
    await submit(
      'Creating match',
      async () => {
        if (stakeUnits > BigInt(0)) {
          const approval = await writeContractAsync({
            address: G_DOLLAR_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [contractAddress, stakeUnits],
            chainId: 42220,
          });
          await waitForTransaction(approval);
        }
        return writeContractAsync({
          address: contractAddress,
          abi: ROCK_PAPER_SCISSORS_ABI,
          functionName: 'createGame',
          args: [gameId, stakeUnits],
          chainId: 42220,
        });
      },
      mode === 'free' ? 'Free match created. Waiting for an opponent.' : `Match created with ${stake} G$ staked.`,
    );
  };

  const joinMatch = async (game: RpsGame) => {
    if (!address || !contractAddress) return;
    await submit(
      'Joining match',
      async () => {
        if (game.stake > BigInt(0)) {
          const approval = await writeContractAsync({
            address: G_DOLLAR_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [contractAddress, game.stake],
            chainId: 42220,
          });
          await waitForTransaction(approval);
        }
        return writeContractAsync({
          address: contractAddress,
          abi: ROCK_PAPER_SCISSORS_ABI,
          functionName: 'joinGame',
          args: [game.id],
          chainId: 42220,
        });
      },
      'Joined the match. Choose and commit your move.',
    );
  };

  const cancelMatch = (game: RpsGame) => {
    if (!contractAddress) return;
    void submit(
      'Cancelling match',
      () => writeContractAsync({
        address: contractAddress,
        abi: ROCK_PAPER_SCISSORS_ABI,
        functionName: 'cancelWaitingGame',
        args: [game.id],
        chainId: 42220,
      }),
      'Match cancelled and your G$ stake refunded.',
    );
  };

  const commitMove = async (game: RpsGame) => {
    if (!address || !contractAddress || selectedMove === null) return;
    const move = selectedMove;
    const salt = createSalt();
    const commitment = keccak256(encodePacked(
      ['bytes32', 'address', 'uint8', 'bytes32'],
      [game.id, getAddress(address), move, salt],
    ));
    const record = { move, salt };
    try {
      window.localStorage.setItem(commitmentStorageKey(game.id, getAddress(address)), JSON.stringify(record));
    } catch {
      setError('Could not save your private move in this browser. Check browser storage settings and try again.');
      return;
    }
    await submit(
      'Committing move',
      () => writeContractAsync({
        address: contractAddress,
        abi: ROCK_PAPER_SCISSORS_ABI,
        functionName: 'commitMove',
        args: [game.id, commitment],
        chainId: 42220,
      }),
      'Move committed privately. Waiting for both players to commit.',
    );
    setSelectedMove(null);
  };

  const revealMove = async (game: RpsGame) => {
    if (!address || !contractAddress) return;
    const record = getCommitment(game.id, getAddress(address));
    if (!record) {
      setError('Your private move is not saved in this browser. You cannot reveal it from this device.');
      return;
    }
    await submit(
      'Revealing move',
      () => writeContractAsync({
        address: contractAddress,
        abi: ROCK_PAPER_SCISSORS_ABI,
        functionName: 'revealMove',
        args: [game.id, record.move, record.salt],
        chainId: 42220,
      }),
      'Move revealed. The contract will settle the match once both moves are revealed.',
    );
  };

  const settleExpired = (game: RpsGame) => {
    if (!contractAddress) return;
    void submit(
      'Settling expired match',
      () => writeContractAsync({
        address: contractAddress,
        abi: ROCK_PAPER_SCISSORS_ABI,
        functionName: 'settleExpiredGame',
        args: [game.id],
        chainId: 42220,
      }),
      'Expired match settled. Any refund or winner payout is handled by the contract.',
    );
  };

  const myGames = useMemo(() => games.myGames, [games.myGames]);

  if (!contractAddress) {
    return (
      <div>
        <PracticeArena />
        <section className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Swords size={21} className="mt-1 text-primary" />
            <div>
              <h3 className="font-display text-xl font-bold">Public matches coming soon</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The practice arena is ready. Free and G$-stake matches against other players will be enabled once the Celo escrow contract is deployed.
              </p>
              <p className="mt-3 rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground">
                Configure NEXT_PUBLIC_RPS_ESCROW_ADDRESS to enable public matches.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
    <PracticeArena />
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">1 v 1</p>
          <h3 className="mt-1 font-display text-2xl font-bold">Rock, Paper, Scissors</h3>
          <p className="mt-1 text-sm text-muted-foreground">Play free or put G$ on the line. Moves stay hidden until both players commit.</p>
        </div>
        <button
          type="button"
          onClick={() => gamesQuery.refetch()}
          disabled={gamesQuery.isFetching || Boolean(busy)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          {gamesQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />}
          Refresh matches
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-danger/20 bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-success-bg p-3 text-sm text-success"><CheckCircle2 size={16} />{notice}</p>}

      {!hasCelo && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
          Switch your wallet to Celo to create or join matches.
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-background p-4">
            <div className="flex flex-wrap gap-2">
              {(['free', 'stake'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  aria-pressed={mode === option}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${mode === option ? 'bg-primary text-primary-foreground' : 'border border-line bg-card text-muted-foreground hover:text-foreground'}`}
                >
                  {option === 'free' ? 'Free play' : 'Play for G$'}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {mode === 'stake' && (
                <label className="min-w-[180px] flex-1 text-xs font-semibold text-muted-foreground">
                  Your stake (G$)
                  <input
                    inputMode="decimal"
                    value={stake}
                    onChange={(event) => setStake(event.target.value)}
                    placeholder="Enter any amount"
                    className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm font-medium text-foreground outline-none focus:border-primary"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={createMatch}
                disabled={!address || !hasCelo || walletPending || Boolean(busy)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy === 'Creating match' ? <Loader2 size={15} className="animate-spin" /> : <Swords size={15} />}
                {busy === 'Creating match' ? 'Creating…' : 'Create public match'}
              </button>
            </div>
            {mode === 'stake' && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Your opponent stakes the same amount. The winner receives the full pot; a draw refunds both players. G$ stakes are escrowed on Celo.
              </p>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-bold">Open matches</h4>
            {gamesQuery.isPending && <p className="text-sm text-muted-foreground">Loading public matches…</p>}
            {gamesQuery.isError && <p role="alert" className="text-sm text-danger">Could not load open matches. Refresh to retry.</p>}
            {!gamesQuery.isPending && games.openGames.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted-foreground">
                No open matches yet. Create one and invite the community to play.
              </p>
            )}
            <div className="space-y-2">
              {games.openGames.map((game) => (
                <div key={game.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{game.stake > BigInt(0) ? `${formatUnits(game.stake, 18)} G$ stake` : 'Free match'}</p>
                    <p className="font-mono text-xs text-muted-foreground">Host {shortAddress(game.creator)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => joinMatch(game)}
                    disabled={!address || !hasCelo || walletPending || Boolean(busy)}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-bold transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    {busy === 'Joining match' ? 'Joining…' : 'Join match'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} /> Your matches</h4>
          {myGames.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted-foreground">
              Create or join a match to play.
            </p>
          )}
          <div className="space-y-3">
            {myGames.map((game) => {
              const isCreator = game.creator.toLowerCase() === address?.toLowerCase();
              const myCommit = isCreator ? game.creatorCommit : game.opponentCommit;
              const otherCommit = isCreator ? game.opponentCommit : game.creatorCommit;
              const myRevealed = isCreator ? game.creatorRevealed : game.opponentRevealed;
              const otherRevealed = isCreator ? game.opponentRevealed : game.creatorRevealed;
              const otherAddress = isCreator ? game.opponent : game.creator;
              const deadline = game.revealDeadline > BigInt(0) ? game.revealDeadline : game.commitDeadline;
              const expired = deadline > BigInt(0) && BigInt(now) > deadline;
              const canReveal = myCommit !== `0x${'0'.repeat(64)}` && otherCommit !== `0x${'0'.repeat(64)}` && !myRevealed;
              const storedMove = address ? getCommitment(game.id, getAddress(address))?.move : undefined;

              return (
                <div key={game.id} className="rounded-xl border border-line bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{game.stake > BigInt(0) ? `${formatUnits(game.stake, 18)} G$ each` : 'Free match'}</p>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">vs {otherAddress === `0x${'0'.repeat(40)}` ? 'Waiting for opponent' : shortAddress(otherAddress)}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                      {game.state === GAME_STATES.waiting ? 'Waiting' : 'Playing'}
                    </span>
                  </div>

                  {game.state === GAME_STATES.waiting && isCreator && (
                    <button
                      type="button"
                      onClick={() => cancelMatch(game)}
                      disabled={Boolean(busy) || walletPending}
                      className="mt-3 rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                    >
                      Cancel match{game.stake > BigInt(0) ? ' and refund stake' : ''}
                    </button>
                  )}

                  {game.state === GAME_STATES.playing && game.opponent !== `0x${'0'.repeat(40)}` && (
                    <>
                      {!myCommit || myCommit === `0x${'0'.repeat(64)}` ? (
                        <div className="mt-4">
                          <p className="text-xs font-semibold text-muted-foreground">Choose your move. It stays hidden until both commit.</p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {ROCK_PAPER_SCISSORS_MOVES.map((move, index) => {
                              const Icon = MOVE_ICONS[index];
                              return (
                                <button
                                  key={move}
                                  type="button"
                                  onClick={() => setSelectedMove(index)}
                                  aria-pressed={selectedMove === index}
                                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-semibold ${selectedMove === index ? 'border-primary bg-primary/10 text-foreground' : 'border-line bg-card text-muted-foreground hover:text-foreground'}`}
                                >
                                  <Icon size={18} />
                                  {move}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => void commitMove(game)}
                            disabled={selectedMove === null || Boolean(busy) || walletPending || !hasCelo}
                            className="mt-2 h-9 w-full rounded-lg bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40"
                          >
                            {busy === 'Committing move' ? 'Committing…' : 'Commit move'}
                          </button>
                        </div>
                      ) : canReveal ? (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground">
                            {otherRevealed ? 'Opponent revealed.' : 'Both moves are committed. Reveal your move.'}
                          </p>
                          {storedMove === undefined && (
                            <p role="alert" className="mt-2 text-xs text-danger">This browser does not have your saved move. You need the original device to reveal.</p>
                          )}
                          <button
                            type="button"
                            onClick={() => void revealMove(game)}
                            disabled={storedMove === undefined || Boolean(busy) || walletPending || !hasCelo}
                            className="mt-2 h-9 w-full rounded-lg bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40"
                          >
                            {busy === 'Revealing move' ? 'Revealing…' : storedMove === undefined ? 'Move unavailable' : `Reveal ${ROCK_PAPER_SCISSORS_MOVES[storedMove]}`}
                          </button>
                        </div>
                      ) : myRevealed ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Your move: {ROCK_PAPER_SCISSORS_MOVES[isCreator ? game.creatorMove : game.opponentMove]} · Waiting for opponent to reveal.
                        </p>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">Waiting for both players to commit.</p>
                      )}
                      {expired && (
                        <button
                          type="button"
                          onClick={() => settleExpired(game)}
                          disabled={Boolean(busy) || walletPending || !hasCelo}
                          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line text-xs font-bold hover:bg-muted disabled:opacity-40"
                        >
                          <Clock3 size={14} />
                          Settle expired match
                        </button>
                      )}
                    </>
                  )}
                  {game.state === GAME_STATES.playing && otherAddress === `0x${'0'.repeat(40)}` && (
                    <p className="mt-3 text-xs text-muted-foreground">Waiting for an opponent to join.</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
            <Wallet size={14} className="mt-0.5 shrink-0" />
            Free matches do not stake G$, but Celo transaction gas still applies. G$ matches use an on-chain escrow; ties refund each stake and non-revealing players can forfeit.
          </p>
        </div>
      </div>
    </section>
    </>
  );
}
