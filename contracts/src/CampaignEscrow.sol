// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

contract CampaignEscrow is Ownable, ReentrancyGuard {
    IERC20 public immutable goodDollar;

    struct Campaign {
        address creator;
        uint256 rewardPerParticipant;
        uint256 remainingBudget;
        uint32 maxParticipants;
        uint32 approvedParticipants;
        uint32 paidParticipants;
        bool open;
    }

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => mapping(address => uint8)) public applicationState;
    mapping(address => bool) public isAdmin;

    error InvalidAddress();
    error InvalidCampaign();
    error CampaignNotOpen();
    error NoParticipantSlots();
    error ApplicationNotApproved();
    error ApplicationAlreadyExists();
    error NotCampaignCreator();
    error NotAdmin();
    error TransferFailed();

    event AdminUpdated(address indexed admin, bool enabled);
    event CampaignCreated(
        bytes32 indexed campaignId,
        address indexed creator,
        uint256 budget,
        uint256 rewardPerParticipant,
        uint32 maxParticipants
    );
    event ParticipantApproved(bytes32 indexed campaignId, address indexed participant, address indexed reviewer);
    event RewardPaid(bytes32 indexed campaignId, address indexed participant, address indexed reviewer, uint256 amount);
    event CampaignClosed(bytes32 indexed campaignId, address indexed creator, uint256 refunded);

    constructor(address token) Ownable(msg.sender) {
        if (token == address(0)) revert InvalidAddress();
        goodDollar = IERC20(token);
    }

    modifier onlyAdmin() {
        if (!isAdmin[msg.sender]) revert NotAdmin();
        _;
    }

    function setAdmin(address admin, bool enabled) external onlyOwner {
        if (admin == address(0)) revert InvalidAddress();
        isAdmin[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

    function createCampaign(bytes32 campaignId, uint256 budget, uint32 maxParticipants)
        external
        nonReentrant
    {
        if (
            campaignId == bytes32(0) ||
            budget == 0 ||
            maxParticipants == 0 ||
            budget < uint256(maxParticipants)
        ) revert InvalidCampaign();
        if (campaigns[campaignId].creator != address(0)) revert InvalidCampaign();

        if (!goodDollar.transferFrom(msg.sender, address(this), budget)) revert TransferFailed();
        uint256 reward = budget / uint256(maxParticipants);
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            rewardPerParticipant: reward,
            remainingBudget: budget,
            maxParticipants: maxParticipants,
            approvedParticipants: 0,
            paidParticipants: 0,
            open: true
        });
        emit CampaignCreated(campaignId, msg.sender, budget, reward, maxParticipants);
    }

    function approveParticipant(bytes32 campaignId, address participant) external onlyAdmin {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (!campaign.open) revert CampaignNotOpen();
        if (applicationState[campaignId][participant] != 0) revert ApplicationAlreadyExists();
        if (campaign.approvedParticipants >= campaign.maxParticipants) revert NoParticipantSlots();

        campaign.approvedParticipants++;
        applicationState[campaignId][participant] = 1;
        emit ParticipantApproved(campaignId, participant, msg.sender);
    }

    function payParticipant(bytes32 campaignId, address participant) external onlyAdmin nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (applicationState[campaignId][participant] != 1) revert ApplicationNotApproved();

        applicationState[campaignId][participant] = 2;
        campaign.paidParticipants++;
        campaign.remainingBudget -= campaign.rewardPerParticipant;
        if (!goodDollar.transfer(participant, campaign.rewardPerParticipant)) revert TransferFailed();
        emit RewardPaid(campaignId, participant, msg.sender, campaign.rewardPerParticipant);
    }

    function closeCampaign(bytes32 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (campaign.creator != msg.sender) revert NotCampaignCreator();
        if (!campaign.open) revert CampaignNotOpen();

        campaign.open = false;
        uint256 outstandingApproved =
            uint256(campaign.approvedParticipants - campaign.paidParticipants) *
            campaign.rewardPerParticipant;
        uint256 refund = campaign.remainingBudget - outstandingApproved;
        campaign.remainingBudget -= refund;
        if (refund > 0 && !goodDollar.transfer(campaign.creator, refund)) revert TransferFailed();
        emit CampaignClosed(campaignId, campaign.creator, refund);
    }
}
