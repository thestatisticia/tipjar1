// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

contract TaskEscrow is Ownable, ReentrancyGuard {
    IERC20 public immutable goodDollar;

    struct Task {
        address creator;
        uint32 availableSlots;
        bool open;
        uint256 rewardPerCompletion;
    }

    mapping(bytes32 => Task) public tasks;
    mapping(bytes32 => mapping(address => uint8)) public submissionState;
    mapping(address => bool) public isAdmin;

    error InvalidAddress();
    error InvalidTask();
    error TaskNotOpen();
    error NoAvailableSlots();
    error SubmissionNotReserved();
    error SubmissionAlreadyExists();
    error NotTaskCreator();
    error NotAdmin();
    error TransferFailed();

    event AdminUpdated(address indexed admin, bool enabled);
    event TaskCreated(
        bytes32 indexed taskId,
        address indexed creator,
        uint256 rewardPerCompletion,
        uint32 slots,
        uint256 totalFunded
    );
    event SubmissionReserved(bytes32 indexed taskId, address indexed worker);
    event RewardReleased(
        bytes32 indexed taskId,
        address indexed worker,
        address indexed reviewer,
        uint256 amount
    );
    event SubmissionRejected(
        bytes32 indexed taskId,
        address indexed worker,
        address indexed reviewer,
        uint256 refunded
    );
    event TaskClosed(bytes32 indexed taskId, address indexed creator, uint256 refunded);

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

    function createTask(bytes32 taskId, uint256 rewardPerCompletion, uint32 slots)
        external
        nonReentrant
    {
        if (taskId == bytes32(0) || rewardPerCompletion == 0 || slots == 0) revert InvalidTask();
        if (tasks[taskId].creator != address(0)) revert InvalidTask();

        uint256 total = rewardPerCompletion * uint256(slots);
        if (!goodDollar.transferFrom(msg.sender, address(this), total)) revert TransferFailed();

        tasks[taskId] = Task({
            creator: msg.sender,
            rewardPerCompletion: rewardPerCompletion,
            availableSlots: slots,
            open: true
        });
        emit TaskCreated(taskId, msg.sender, rewardPerCompletion, slots, total);
    }

    function reserveSubmission(bytes32 taskId) external {
        Task storage task = tasks[taskId];
        if (task.creator == address(0)) revert InvalidTask();
        if (!task.open) revert TaskNotOpen();
        if (task.availableSlots == 0) revert NoAvailableSlots();
        if (submissionState[taskId][msg.sender] != 0) revert SubmissionAlreadyExists();

        unchecked {
            task.availableSlots--;
        }
        submissionState[taskId][msg.sender] = 1;
        emit SubmissionReserved(taskId, msg.sender);
    }

    function approveSubmission(bytes32 taskId, address worker) external onlyAdmin nonReentrant {
        Task storage task = tasks[taskId];
        if (task.creator == address(0)) revert InvalidTask();
        if (submissionState[taskId][worker] != 1) revert SubmissionNotReserved();

        submissionState[taskId][worker] = 2;
        if (!goodDollar.transfer(worker, task.rewardPerCompletion)) revert TransferFailed();
        emit RewardReleased(taskId, worker, msg.sender, task.rewardPerCompletion);
    }

    function rejectSubmission(bytes32 taskId, address worker) external onlyAdmin nonReentrant {
        Task storage task = tasks[taskId];
        if (task.creator == address(0)) revert InvalidTask();
        if (submissionState[taskId][worker] != 1) revert SubmissionNotReserved();

        submissionState[taskId][worker] = 0;
        uint256 refund;
        if (task.open) {
            task.availableSlots++;
        } else {
            refund = task.rewardPerCompletion;
            if (!goodDollar.transfer(task.creator, refund)) revert TransferFailed();
        }
        emit SubmissionRejected(taskId, worker, msg.sender, refund);
    }

    function closeTask(bytes32 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        if (task.creator == address(0)) revert InvalidTask();
        if (task.creator != msg.sender) revert NotTaskCreator();
        if (!task.open) revert TaskNotOpen();

        task.open = false;
        uint256 refund = task.rewardPerCompletion * uint256(task.availableSlots);
        task.availableSlots = 0;
        if (refund > 0 && !goodDollar.transfer(task.creator, refund)) revert TransferFailed();
        emit TaskClosed(taskId, task.creator, refund);
    }
}
