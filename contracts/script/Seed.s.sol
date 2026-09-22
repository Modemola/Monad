// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IngotIndex} from "../src/IngotIndex.sol";
import {IngotMarket} from "../src/IngotMarket.sol";
import {UnderwriterVault} from "../src/UnderwriterVault.sol";
import {HedgedCredit} from "../src/HedgedCredit.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Backfills index history, lists the front contract, and capitalizes both pools.
///
/// @dev Usage:
///        forge script script/Seed.s.sol --rpc-url $MONAD_TESTNET_RPC_URL --broadcast
///
///      The backfill publishes prints stamped in the past, which the index accepts as long as each
///      one advances and none is in the future. They all become settleable once the finality delay
///      elapses, so the market is live about a minute after this runs.
contract Seed is Script {
    uint256 internal constant HOURS_OF_HISTORY = 96;
    uint256 internal constant BASE_PRICE = 2.45e18;

    uint256 internal constant VAULT_CAPITAL = 2_000_000e6;
    uint256 internal constant CREDIT_CAPITAL = 1_000_000e6;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);

        IngotIndex index = IngotIndex(vm.parseJsonAddress(json, ".index"));
        IngotMarket market = IngotMarket(vm.parseJsonAddress(json, ".market"));
        UnderwriterVault underwriter = UnderwriterVault(vm.parseJsonAddress(json, ".underwriterVault"));
        HedgedCredit credit = HedgedCredit(vm.parseJsonAddress(json, ".hedgedCredit"));
        MockUSDC usdc = MockUSDC(vm.parseJsonAddress(json, ".usdc"));

        vm.startBroadcast(deployerKey);

        _backfill(index);
        uint256 seriesId = _listFrontContract(market);
        _capitalize(usdc, underwriter, credit, deployer);

        vm.stopBroadcast();

        console.log("series listed  ", seriesId);
        console.log("vault NAV      ", underwriter.totalAssets());
        console.log("credit NAV     ", credit.totalAssets());
        console.log("market live in ", index.finalityDelay(), "seconds");
    }

    /// @dev A deterministic random walk around the base rate. Not real data — the backtest reads
    ///      real marketplace prices — but enough shape that the chart is not a flat line.
    function _backfill(IngotIndex index) internal {
        uint64 start = uint64(block.timestamp) - uint64(HOURS_OF_HISTORY * 1 hours);
        uint256 price = BASE_PRICE;

        for (uint256 i = 0; i < HOURS_OF_HISTORY; ++i) {
            uint256 entropy = uint256(keccak256(abi.encode("ingot-seed", i))) % 600; // 0..6%
            price = i % 3 == 0
                ? (price * (10_000 + entropy)) / 10_000
                : (price * (10_000 - entropy / 2)) / 10_000;

            index.publish(start + uint64(i * 1 hours), price, 150 + uint32(i), 12);
        }
        console.log("backfilled prints", HOURS_OF_HISTORY);
        console.log("last price       ", price);
    }

    /// @dev One front-month contract whose delivery window opens now.
    function _listFrontContract(IngotMarket market) internal returns (uint256) {
        uint64 windowStart = uint64(block.timestamp);
        uint64 expiry = windowStart + 30 days;
        return market.listSeries(windowStart, expiry, 0);
    }

    function _capitalize(
        MockUSDC usdc,
        UnderwriterVault underwriter,
        HedgedCredit credit,
        address deployer
    ) internal {
        usdc.mint(deployer, VAULT_CAPITAL + CREDIT_CAPITAL);

        usdc.approve(address(underwriter), VAULT_CAPITAL);
        underwriter.deposit(VAULT_CAPITAL);

        usdc.approve(address(credit), CREDIT_CAPITAL);
        credit.depositLender(CREDIT_CAPITAL);
    }
}
