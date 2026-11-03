// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RockPaperScissorsEscrow} from "../src/RockPaperScissorsEscrow.sol";

contract MockRpsDollar {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract RockPaperScissorsEscrowTest is Test {
    uint256 private constant ONE_G = 1e18;
    bytes32 private constant GAME_ID = keccak256("rps-game-1");

    MockRpsDollar private token;
    RockPaperScissorsEscrow private game;
    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);
    address private stranger = address(0x5157);

    function setUp() public {
        token = new MockRpsDollar();
        game = new RockPaperScissorsEscrow(address(token));
        token.mint(alice, 100 * ONE_G);
        token.mint(bob, 100 * ONE_G);
        vm.prank(alice);
        token.approve(address(game), type(uint256).max);
        vm.prank(bob);
        token.approve(address(game), type(uint256).max);
    }

    function test_WinnerReceivesBothStakesAfterReveal() public {
        _startGame(10 * ONE_G);
        bytes32 aliceSalt = keccak256("alice-salt");
        bytes32 bobSalt = keccak256("bob-salt");
        vm.prank(alice);
        game.commitMove(GAME_ID, _commitment(alice, 0, aliceSalt));
        vm.prank(bob);
        game.commitMove(GAME_ID, _commitment(bob, 2, bobSalt));
        vm.prank(alice);
        game.revealMove(GAME_ID, 0, aliceSalt);
        vm.prank(bob);
        game.revealMove(GAME_ID, 2, bobSalt);

        assertEq(token.balanceOf(alice), 110 * ONE_G);
        assertEq(token.balanceOf(bob), 90 * ONE_G);
        RockPaperScissorsEscrow.Game memory result = game.getGame(GAME_ID);
        assertEq(uint8(result.state), uint8(RockPaperScissorsEscrow.GameState.Settled));
    }

    function test_DrawRefundsBothPlayers() public {
        _startGame(10 * ONE_G);
        bytes32 aliceSalt = keccak256("alice-draw-salt");
        bytes32 bobSalt = keccak256("bob-draw-salt");
        vm.prank(alice);
        game.commitMove(GAME_ID, _commitment(alice, 1, aliceSalt));
        vm.prank(bob);
        game.commitMove(GAME_ID, _commitment(bob, 1, bobSalt));
        vm.prank(alice);
        game.revealMove(GAME_ID, 1, aliceSalt);
        vm.prank(bob);
        game.revealMove(GAME_ID, 1, bobSalt);

        assertEq(token.balanceOf(alice), 100 * ONE_G);
        assertEq(token.balanceOf(bob), 100 * ONE_G);
        RockPaperScissorsEscrow.Game memory result = game.getGame(GAME_ID);
        assertEq(uint8(result.state), uint8(RockPaperScissorsEscrow.GameState.Settled));
    }

    function test_FreeGameDoesNotTransferG() public {
        _startGame(0);
        bytes32 aliceSalt = keccak256("alice-free-salt");
        bytes32 bobSalt = keccak256("bob-free-salt");
        vm.prank(alice);
        game.commitMove(GAME_ID, _commitment(alice, 2, aliceSalt));
        vm.prank(bob);
        game.commitMove(GAME_ID, _commitment(bob, 1, bobSalt));
        vm.prank(alice);
        game.revealMove(GAME_ID, 2, aliceSalt);
        vm.prank(bob);
        game.revealMove(GAME_ID, 1, bobSalt);

        assertEq(token.balanceOf(alice), 100 * ONE_G);
        assertEq(token.balanceOf(bob), 100 * ONE_G);
        assertEq(uint8(game.getGame(GAME_ID).state), uint8(RockPaperScissorsEscrow.GameState.Settled));
    }

    function test_InvalidRevealRevertsAndCannotStealStake() public {
        _startGame(5 * ONE_G);
        bytes32 aliceSalt = keccak256("alice-secret");
        bytes32 bobSalt = keccak256("bob-secret");
        vm.prank(alice);
        game.commitMove(GAME_ID, _commitment(alice, 0, aliceSalt));
        vm.prank(bob);
        game.commitMove(GAME_ID, _commitment(bob, 2, bobSalt));
        vm.prank(alice);
        vm.expectRevert(RockPaperScissorsEscrow.InvalidReveal.selector);
        game.revealMove(GAME_ID, 2, aliceSalt);
        assertEq(token.balanceOf(address(game)), 10 * ONE_G);
    }

    function test_NonRevealingPlayerLosesAfterRevealTimeout() public {
        _startGame(3 * ONE_G);
        bytes32 aliceSalt = keccak256("alice-timeout");
        bytes32 bobSalt = keccak256("bob-timeout");
        vm.prank(alice);
        game.commitMove(GAME_ID, _commitment(alice, 0, aliceSalt));
        vm.prank(bob);
        game.commitMove(GAME_ID, _commitment(bob, 1, bobSalt));
        vm.prank(alice);
        game.revealMove(GAME_ID, 0, aliceSalt);
        vm.warp(block.timestamp + game.TURN_TIMEOUT() + 1);
        vm.prank(stranger);
        game.settleExpiredGame(GAME_ID);

        assertEq(token.balanceOf(alice), 103 * ONE_G);
        assertEq(token.balanceOf(bob), 97 * ONE_G);
    }

    function test_CreatorCanCancelWaitingGameAndGetRefund() public {
        vm.prank(alice);
        game.createGame(GAME_ID, 7 * ONE_G);
        vm.prank(alice);
        game.cancelWaitingGame(GAME_ID);

        assertEq(token.balanceOf(alice), 100 * ONE_G);
        assertEq(uint8(game.getGame(GAME_ID).state), uint8(RockPaperScissorsEscrow.GameState.Cancelled));
    }

    function test_PlayerCannotJoinOwnGame() public {
        vm.prank(alice);
        game.createGame(GAME_ID, 0);
        vm.prank(alice);
        vm.expectRevert(RockPaperScissorsEscrow.CreatorCannotJoinOwnGame.selector);
        game.joinGame(GAME_ID);
    }

    function _startGame(uint256 stake) private {
        vm.prank(alice);
        game.createGame(GAME_ID, stake);
        vm.prank(bob);
        game.joinGame(GAME_ID);
    }

    function _commitment(address player, uint8 move, bytes32 salt) private view returns (bytes32) {
        return keccak256(abi.encodePacked(GAME_ID, player, move, salt));
    }
}
