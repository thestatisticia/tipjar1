// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CampaignEscrow} from "../src/CampaignEscrow.sol";

contract MockCampaignDollar {
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

contract CampaignEscrowTest is Test {
    uint256 private constant ONE_G = 1e18;
    bytes32 private constant CAMPAIGN_ID = keccak256("campaign-1");

    MockCampaignDollar private token;
    CampaignEscrow private escrow;
    address private creator = address(0x10);
    address private participant = address(0x20);
    address private reviewer = address(0x30);

    function setUp() public {
        token = new MockCampaignDollar();
        escrow = new CampaignEscrow(address(token));
        escrow.setAdmin(reviewer, true);
        token.mint(creator, 100 * ONE_G);
        vm.prank(creator);
        token.approve(address(escrow), type(uint256).max);
    }

    function test_FundApproveAndPayParticipant() public {
        vm.prank(creator);
        escrow.createCampaign(CAMPAIGN_ID, 30 * ONE_G, 3);
        vm.prank(reviewer);
        escrow.approveParticipant(CAMPAIGN_ID, participant);
        vm.prank(reviewer);
        escrow.payParticipant(CAMPAIGN_ID, participant);

        assertEq(token.balanceOf(participant), 10 * ONE_G);
        assertEq(token.balanceOf(address(escrow)), 20 * ONE_G);
        assertEq(escrow.applicationState(CAMPAIGN_ID, participant), 2);
    }

    function test_CloseRefundsUnallocatedBudgetKeepsApprovedShare() public {
        vm.prank(creator);
        escrow.createCampaign(CAMPAIGN_ID, 30 * ONE_G, 3);
        vm.prank(reviewer);
        escrow.approveParticipant(CAMPAIGN_ID, participant);
        vm.prank(reviewer);
        escrow.payParticipant(CAMPAIGN_ID, participant);
        vm.prank(creator);
        escrow.closeCampaign(CAMPAIGN_ID);

        assertEq(token.balanceOf(creator), 90 * ONE_G);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(participant), 10 * ONE_G);
    }

    function test_RejectNonAdmin() public {
        vm.prank(creator);
        escrow.createCampaign(CAMPAIGN_ID, 10 * ONE_G, 1);
        vm.prank(address(0x40));
        vm.expectRevert(CampaignEscrow.NotAdmin.selector);
        escrow.approveParticipant(CAMPAIGN_ID, participant);
    }

    function test_MaxParticipantsCannotBeExceeded() public {
        address second = address(0x21);
        vm.prank(creator);
        escrow.createCampaign(CAMPAIGN_ID, 10 * ONE_G, 1);
        vm.prank(reviewer);
        escrow.approveParticipant(CAMPAIGN_ID, participant);
        vm.prank(reviewer);
        vm.expectRevert(CampaignEscrow.NoParticipantSlots.selector);
        escrow.approveParticipant(CAMPAIGN_ID, second);
    }

    function test_BudgetMustCoverAtLeastOneWeiPerParticipant() public {
        vm.prank(creator);
        vm.expectRevert(CampaignEscrow.InvalidCampaign.selector);
        escrow.createCampaign(CAMPAIGN_ID, 1, 2);
    }
}
