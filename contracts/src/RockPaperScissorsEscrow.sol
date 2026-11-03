// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

contract RockPaperScissorsEscrow is ReentrancyGuard {
    uint64 public constant TURN_TIMEOUT = 15 minutes;

    enum GameState {
        None,
        Waiting,
        Playing,
        Settled,
        Cancelled
    }

    struct Game {
        address creator;
        address opponent;
        uint256 stake;
        uint64 createdAt;
        uint64 commitDeadline;
        uint64 revealDeadline;
        bytes32 creatorCommit;
        bytes32 opponentCommit;
        uint8 creatorMove;
        uint8 opponentMove;
        GameState state;
        bool creatorRevealed;
        bool opponentRevealed;
    }

    IERC20 public immutable goodDollar;
    mapping(bytes32 => Game) private games;

    error InvalidAddress();
    error InvalidGame();
    error InvalidMove();
    error GameNotWaiting();
    error GameNotPlaying();
    error NotPlayer();
    error CreatorCannotJoinOwnGame();
    error InvalidCommitment();
    error AlreadyCommitted();
    error CommitPhaseClosed();
    error RevealPhaseClosed();
    error InvalidReveal();
    error GameNotExpired();
    error NotGameCreator();
    error TransferFailed();

    event GameCreated(bytes32 indexed gameId, address indexed creator, uint256 stake);
    event GameJoined(bytes32 indexed gameId, address indexed opponent);
    event MoveCommitted(bytes32 indexed gameId, address indexed player);
    event MoveRevealed(bytes32 indexed gameId, address indexed player, uint8 move);
    event GameSettled(bytes32 indexed gameId, address indexed winner, bool draw, uint256 payoutEach);
    event GameCancelled(bytes32 indexed gameId, address indexed by, uint256 refundEach);

    constructor(address token) {
        if (token == address(0)) revert InvalidAddress();
        goodDollar = IERC20(token);
    }

    function createGame(bytes32 gameId, uint256 stake) external nonReentrant {
        if (gameId == bytes32(0) || games[gameId].state != GameState.None) revert InvalidGame();
        if (stake > 0 && !goodDollar.transferFrom(msg.sender, address(this), stake)) revert TransferFailed();

        games[gameId] = Game({
            creator: msg.sender,
            opponent: address(0),
            stake: stake,
            createdAt: uint64(block.timestamp),
            commitDeadline: 0,
            revealDeadline: 0,
            creatorCommit: bytes32(0),
            opponentCommit: bytes32(0),
            creatorMove: 0,
            opponentMove: 0,
            state: GameState.Waiting,
            creatorRevealed: false,
            opponentRevealed: false
        });
        emit GameCreated(gameId, msg.sender, stake);
    }

    function joinGame(bytes32 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Waiting) revert GameNotWaiting();
        if (game.creator == msg.sender) revert CreatorCannotJoinOwnGame();
        if (game.stake > 0 && !goodDollar.transferFrom(msg.sender, address(this), game.stake)) {
            revert TransferFailed();
        }

        game.opponent = msg.sender;
        game.state = GameState.Playing;
        game.commitDeadline = uint64(block.timestamp) + TURN_TIMEOUT;
        emit GameJoined(gameId, msg.sender);
    }

    function commitMove(bytes32 gameId, bytes32 commitment) external {
        Game storage game = games[gameId];
        if (game.state != GameState.Playing) revert GameNotPlaying();
        if (block.timestamp > game.commitDeadline) revert CommitPhaseClosed();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        if (msg.sender == game.creator) {
            if (game.creatorCommit != bytes32(0)) revert AlreadyCommitted();
            game.creatorCommit = commitment;
        } else if (msg.sender == game.opponent) {
            if (game.opponentCommit != bytes32(0)) revert AlreadyCommitted();
            game.opponentCommit = commitment;
        } else {
            revert NotPlayer();
        }
        emit MoveCommitted(gameId, msg.sender);

        if (game.creatorCommit != bytes32(0) && game.opponentCommit != bytes32(0)) {
            game.revealDeadline = uint64(block.timestamp) + TURN_TIMEOUT;
        }
    }

    function revealMove(bytes32 gameId, uint8 move, bytes32 salt) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Playing) revert GameNotPlaying();
        if (
            game.creatorCommit == bytes32(0) ||
            game.opponentCommit == bytes32(0) ||
            block.timestamp > game.revealDeadline
        ) revert RevealPhaseClosed();
        if (move > 2) revert InvalidMove();

        bytes32 commitment = keccak256(abi.encodePacked(gameId, msg.sender, move, salt));
        if (msg.sender == game.creator) {
            if (game.creatorRevealed || commitment != game.creatorCommit) revert InvalidReveal();
            game.creatorMove = move;
            game.creatorRevealed = true;
        } else if (msg.sender == game.opponent) {
            if (game.opponentRevealed || commitment != game.opponentCommit) revert InvalidReveal();
            game.opponentMove = move;
            game.opponentRevealed = true;
        } else {
            revert NotPlayer();
        }
        emit MoveRevealed(gameId, msg.sender, move);

        if (game.creatorRevealed && game.opponentRevealed) {
            _settle(gameId, game);
        }
    }

    function cancelWaitingGame(bytes32 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Waiting) revert GameNotWaiting();
        if (game.creator != msg.sender) revert NotGameCreator();
        game.state = GameState.Cancelled;
        if (game.stake > 0 && !goodDollar.transfer(game.creator, game.stake)) revert TransferFailed();
        emit GameCancelled(gameId, msg.sender, game.stake);
    }

    function settleExpiredGame(bytes32 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Playing) revert GameNotPlaying();

        if (game.creatorCommit == bytes32(0) || game.opponentCommit == bytes32(0)) {
            if (block.timestamp <= game.commitDeadline) revert GameNotExpired();
            _refundBoth(gameId, game);
            return;
        }

        if (block.timestamp <= game.revealDeadline) revert GameNotExpired();
        if (game.creatorRevealed != game.opponentRevealed) {
            address winner = game.creatorRevealed ? game.creator : game.opponent;
            uint256 payout = game.stake * 2;
            game.state = GameState.Settled;
            if (payout > 0 && !goodDollar.transfer(winner, payout)) revert TransferFailed();
            emit GameSettled(gameId, winner, false, payout);
        } else {
            _refundBoth(gameId, game);
        }
    }

    function getGame(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function _settle(bytes32 gameId, Game storage game) private {
        game.state = GameState.Settled;
        if (game.creatorMove == game.opponentMove) {
            if (game.stake > 0) {
                if (!goodDollar.transfer(game.creator, game.stake)) revert TransferFailed();
                if (!goodDollar.transfer(game.opponent, game.stake)) revert TransferFailed();
            }
            emit GameSettled(gameId, address(0), true, game.stake);
            return;
        }

        bool creatorWins =
            (game.creatorMove == 0 && game.opponentMove == 2) ||
            (game.creatorMove == 1 && game.opponentMove == 0) ||
            (game.creatorMove == 2 && game.opponentMove == 1);
        address winner = creatorWins ? game.creator : game.opponent;
        uint256 payout = game.stake * 2;
        if (payout > 0 && !goodDollar.transfer(winner, payout)) revert TransferFailed();
        emit GameSettled(gameId, winner, false, payout);
    }

    function _refundBoth(bytes32 gameId, Game storage game) private {
        game.state = GameState.Cancelled;
        if (game.stake > 0) {
            if (!goodDollar.transfer(game.creator, game.stake)) revert TransferFailed();
            if (!goodDollar.transfer(game.opponent, game.stake)) revert TransferFailed();
        }
        emit GameCancelled(gameId, address(0), game.stake);
    }
}
