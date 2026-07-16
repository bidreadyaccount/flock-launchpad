// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FlockLaunchpad.sol";

/// Deploys FlockLaunchpad to Robinhood Chain mainnet (chain id 4663).
///
/// Usage:
///   export PRIVATE_KEY=0x...            # throwaway deployer key with a little ETH
///   export TREASURY=0x...               # wallet that receives fees (use a separate, safe wallet)
///   forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast
contract Deploy is Script {
    // Official Uniswap v2 Router02 on Robinhood Chain
    // (source: developers.uniswap.org/docs/protocols/v2/deployments)
    address constant UNISWAP_V2_ROUTER = 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast(pk);

        new FlockLaunchpad(
            UNISWAP_V2_ROUTER,
            treasury,
            1 ether,                    // virtual ETH reserve
            1_073_000_000 ether,        // virtual token reserve
            100,                        // 1% trade fee
            0,                          // graduation fee: zero — nothing skimmed from the pot
            2000                        // 20% of the fee buys the coin back and burns it
        );

        vm.stopBroadcast();
    }
}
