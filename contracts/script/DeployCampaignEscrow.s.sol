// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CampaignEscrow} from "../src/CampaignEscrow.sol";

contract DeployCampaignEscrow is Script {
    address constant G_DOLLAR_MAINNET = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;
    address constant G_DOLLAR_ALFAJORES = 0x03d3daB843e6c03b3d271eff9178e6A96c28D25f;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY_HEX");
        address initialAdmin = vm.envAddress("CAMPAIGN_ESCROW_ADMIN_WALLET");
        address token = block.chainid == 42220 ? G_DOLLAR_MAINNET : G_DOLLAR_ALFAJORES;

        vm.startBroadcast(deployerPrivateKey);
        CampaignEscrow escrow = new CampaignEscrow(token);
        escrow.setAdmin(initialAdmin, true);
        vm.stopBroadcast();

        console.log("CampaignEscrow deployed to:", address(escrow));
        console.log("GoodDollar token:", token);
        console.log("Owner:", escrow.owner());
        console.log("Initial admin:", initialAdmin);
    }
}
