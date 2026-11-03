// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";

contract MockTaskDollar {
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

contract TaskEscrowTest is Test {
    uint256 private constant ONE_G = 1e18;
    bytes32 private constant TASK_ID = keccak256("task-1");

    MockTaskDollar private token;
    TaskEscrow private escrow;
    address private creator = address(0x10);
    address private worker = address(0x20);
    address private reviewer = address(0x30);

    function setUp() public {
        token = new MockTaskDollar();
        escrow = new TaskEscrow(address(token));
        escrow.setAdmin(reviewer, true);
        token.mint(creator, 100 * ONE_G);
        vm.prank(creator);
        token.approve(address(escrow), type(uint256).max);
    }

    function test_FundReserveAndApprovePaysWorker() public {
        vm.prank(creator);
        escrow.createTask(TASK_ID, 5 * ONE_G, 3);
        assertEq(token.balanceOf(address(escrow)), 15 * ONE_G);

        vm.prank(worker);
        escrow.reserveSubmission(TASK_ID);
        assertEq(escrow.submissionState(TASK_ID, worker), 1);

        vm.prank(reviewer);
        escrow.approveSubmission(TASK_ID, worker);
        assertEq(token.balanceOf(worker), 5 * ONE_G);
        assertEq(escrow.submissionState(TASK_ID, worker), 2);
    }

    function test_RejectAllowsWorkerToResubmit() public {
        vm.prank(creator);
        escrow.createTask(TASK_ID, ONE_G, 1);

        vm.prank(worker);
        escrow.reserveSubmission(TASK_ID);
        vm.prank(reviewer);
        escrow.rejectSubmission(TASK_ID, worker);
        assertEq(escrow.submissionState(TASK_ID, worker), 0);

        vm.prank(worker);
        escrow.reserveSubmission(TASK_ID);
        assertEq(escrow.submissionState(TASK_ID, worker), 1);
    }

    function test_CloseRefundsOnlyUnreservedSlotsAndKeepsPendingReward() public {
        vm.prank(creator);
        escrow.createTask(TASK_ID, 2 * ONE_G, 3);
        vm.prank(worker);
        escrow.reserveSubmission(TASK_ID);

        vm.prank(creator);
        escrow.closeTask(TASK_ID);
        assertEq(token.balanceOf(creator), 98 * ONE_G);
        assertEq(token.balanceOf(address(escrow)), 2 * ONE_G);

        vm.prank(reviewer);
        escrow.approveSubmission(TASK_ID, worker);
        assertEq(token.balanceOf(worker), 2 * ONE_G);
    }

    function test_OnlyAllowlistedAdminCanApprove() public {
        vm.prank(creator);
        escrow.createTask(TASK_ID, ONE_G, 1);
        vm.prank(worker);
        escrow.reserveSubmission(TASK_ID);

        vm.prank(address(0x40));
        vm.expectRevert(TaskEscrow.NotAdmin.selector);
        escrow.approveSubmission(TASK_ID, worker);
    }

    function test_RejectAfterTaskCloseRefundsReservedRewardToCreator() public {
        vm.prank(creator);
        escrow.createTask(TASK_ID, 2 * ONE_G, 2);
        vm.prank(worker);
        escrow.reserveSubmission(TASK_ID);
        vm.prank(creator);
        escrow.closeTask(TASK_ID);

        vm.prank(reviewer);
        escrow.rejectSubmission(TASK_ID, worker);

        assertEq(token.balanceOf(creator), 100 * ONE_G);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_OneWorkerCannotReserveSameTaskTwice() public {
        vm.prank(creator);
        escrow.createTask(TASK_ID, ONE_G, 2);
        vm.startPrank(worker);
        escrow.reserveSubmission(TASK_ID);
        vm.expectRevert(TaskEscrow.SubmissionAlreadyExists.selector);
        escrow.reserveSubmission(TASK_ID);
        vm.stopPrank();
    }
}
