// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IngotIndex} from "../src/IngotIndex.sol";
import {IngotMarket} from "../src/IngotMarket.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";
import {HedgedCredit} from "../src/HedgedCredit.sol";
import {IIngotIndex} from "../src/interfaces/IIngotIndex.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys the full Ingot stack and writes the addresses to deployments/<chainid>.json.
///
/// @dev Usage:
///        forge script script/Deploy.s.sol --rpc-url $MONAD_TESTNET_RPC_URL --broadcast
///
///      Set USDC_ADDRESS to use a real token; otherwise a mock six-decimal USDC is deployed and
///      left mintable, which is what a testnet judge needs to actually try the product.
contract Deploy is Script {
    /// @dev Testnet finality delay. Short so a judge clicking the live link is not staring at a
    ///      disabled market for an hour. Mainnet would run the default.
    uint32 internal constant TESTNET_FINALITY_DELAY = 60;
    uint32 internal constant TESTNET_MIN_INTERVAL = 60;

    /// @dev Chains where deploying the freely mintable MockUSDC is acceptable.
    uint256 internal constant MONAD_TESTNET = 10143;
    uint256 internal constant ANVIL = 31337;

    error MockCollateralOutsideTestnet(uint256 chainId);

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("deployer", deployer);
        console.log("chain   ", block.chainid);

        vm.startBroadcast(deployerKey);

        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        if (usdc == address(0)) {
            // MockUSDC has an unrestricted mint, which is right for a testnet a judge has to
            // get funds on and catastrophic anywhere else. The same command that produces a
            // correct testnet deployment would otherwise produce a mainnet one backed by a
            // token anyone can print, so the guard is here rather than in the runbook.
            if (block.chainid != MONAD_TESTNET && block.chainid != ANVIL) {
                revert MockCollateralOutsideTestnet(block.chainid);
            }
            usdc = address(new MockUSDC());
            console.log("usdc     (mock deployed)", usdc);
        } else {
            console.log("usdc     (existing)", usdc);
        }

        IngotIndex index = new IngotIndex(
            "H100-SXM-80GB on-demand, USD/GPU-hour",
            keccak256("ingot-index-methodology-v1"),
            "https://github.com/Modemola/Monad/blob/main/docs/methodology.md",
            deployer
        );

        IngotMarket market = new IngotMarket(IIngotIndex(address(index)), IERC20(usdc), deployer);
        UnderwriterVault underwriter = new UnderwriterVault(market, IERC20(usdc), deployer);
        HedgedCredit credit = new HedgedCredit(market, IERC20(usdc), deployer);

        market.setVault(address(underwriter));
        index.setPublisher(deployer, true);
        index.setGuards(TESTNET_FINALITY_DELAY, 2_500, TESTNET_MIN_INTERVAL);

        vm.stopBroadcast();

        _record(usdc, address(index), address(market), address(underwriter), address(credit), deployer);
    }

    function _record(
        address usdc,
        address index,
        address market,
        address underwriter,
        address credit,
        address deployer
    ) internal {
        string memory key = "ingot";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeAddress(key, "index", index);
        vm.serializeAddress(key, "market", market);
        vm.serializeAddress(key, "underwriterVault", underwriter);
        string memory json = vm.serializeAddress(key, "hedgedCredit", credit);

        string memory path =
            string.concat("./deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console.log("index           ", index);
        console.log("market          ", market);
        console.log("underwriterVault", underwriter);
        console.log("hedgedCredit    ", credit);
        console.log("written to      ", path);
    }
}
