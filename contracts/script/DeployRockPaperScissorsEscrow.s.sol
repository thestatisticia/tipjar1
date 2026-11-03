// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {RockPaperScissorsEscrow} from "../src/RockPaperScissorsEscrow.sol";

contract DeployRockPaperScissorsEscrow is Script {
    address constant G_DOLLAR_MAINNET = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;
    address constant G_DOLLAR_ALFAJORES = 0x03d3daB843e6c03b3d271eff9178e6A96c28D25f;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY_HEX");
        address token = block.chainid == 42220 ? G_DOLLAR_MAINNET : G_DOLLAR_ALFAJORES;

        vm.startBroadcast(deployerPrivateKey);
        RockPaperScissorsEscrow escrow = new RockPaperScissorsEscrow(token);
        vm.stopBroadcast();

        console.log("RockPaperScissorsEscrow deployed to:", address(escrow));
        console.log("GoodDollar token:", token);
    }
}
