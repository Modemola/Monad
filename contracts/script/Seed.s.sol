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
///        # once the finality delay has passed:
///        forge script script/Seed.s.sol --sig "openDemoLoan()" --rpc-url $MONAD_TESTNET_RPC_URL --broadcast
///
///      The backfill publishes the real daily index history, stamped in the past, which the index
///      accepts as long as each print advances and none is in the future. They all become
///      settleable once the finality delay elapses, so the market is live about a minute after
///      this runs.
contract Seed is Script {
    string internal constant HISTORY = "./data/h100_index.csv";

    uint256 internal constant VAULT_CAPITAL = 2_000_000e6;
    uint256 internal constant CREDIT_CAPITAL = 1_000_000e6;

    /// @dev The demonstration loan: a month of 100,000 GPU-hours sold at the index, 60,000 USDC
    ///      of margin. The same shape as the README's worked example.
    uint256 internal constant DEMO_HOURS = 100_000e18;
    uint16 internal constant DEMO_BASIS_BPS = 10_000;
    uint256 internal constant DEMO_MARGIN = 60_000e6;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        (
            IngotIndex index,
            IngotMarket market,
            UnderwriterVault underwriter,
            HedgedCredit credit,
            MockUSDC usdc
        ) = _stack();

        vm.startBroadcast(deployerKey);

        backfill(index);
        uint256 seriesId = _listFrontContract(market);
        _capitalize(usdc, underwriter, credit, deployer);

        vm.stopBroadcast();

        console.log("series listed  ", seriesId);
        console.log("vault NAV      ", underwriter.totalAssets());
        console.log("credit NAV     ", credit.totalAssets());
        console.log("market live in ", index.finalityDelay(), "seconds");
    }

    /// @notice Opens one hedged loan from the deployer, so the credit desk's recovery profile is
    ///         read from a real loan on chain from the first visit rather than an empty panel.
    /// @dev Run after the backfill has finalized: the hedge fills at the mark, and the mark needs
    ///      a settleable print. The hedge may fill no worse than 2% under the mark.
    function openDemoLoan() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        (, IngotMarket market,, HedgedCredit credit, MockUSDC usdc) = _stack();

        uint256 seriesId = market.seriesCount() - 1;
        uint256 minHedgePrice = (market.markPrice(seriesId) * 98) / 100;

        vm.startBroadcast(deployerKey);
        usdc.mint(deployer, DEMO_MARGIN);
        usdc.approve(address(credit), DEMO_MARGIN);
        uint256 loanId = credit.open(seriesId, DEMO_HOURS, DEMO_BASIS_BPS, DEMO_MARGIN, minHedgePrice);
        vm.stopBroadcast();

        console.log("demo loan      ", loanId);
        console.log("hedged at      ", credit.loanAt(loanId).hedgeEntryPrice);
    }

    function _stack()
        internal
        view
        returns (IngotIndex, IngotMarket, UnderwriterVault, HedgedCredit, MockUSDC)
    {
        string memory json = vm.readFile(string.concat("./deployments/", vm.toString(block.chainid), ".json"));
        return (
            IngotIndex(vm.parseJsonAddress(json, ".index")),
            IngotMarket(vm.parseJsonAddress(json, ".market")),
            UnderwriterVault(vm.parseJsonAddress(json, ".underwriterVault")),
            HedgedCredit(vm.parseJsonAddress(json, ".hedgedCredit")),
            MockUSDC(vm.parseJsonAddress(json, ".usdc"))
        );
    }

    /// @notice Publishes the real index history: one print per day from the backtest series in
    ///         `data/h100_index.csv`, at noon UTC, with the sample and venue counts behind each.
    /// @dev The same series the landing page charts and docs/BACKTEST.md analyses, so the chain,
    ///      the app and the docs show one index. Every consecutive move is inside the index's 25%
    ///      deviation guard (the widest is 24.6%), and the live publisher's first print continues
    ///      from the last real level instead of jumping from a synthetic one.
    ///      Public so the test suite can prove every row is accepted by the index's guards.
    function backfill(IngotIndex index) public returns (uint256 prints, uint256 lastPrice) {
        string[] memory lines = vm.split(vm.readFile(HISTORY), "\n");
        // Line 0 is the header: date,price_usd_per_gpu_hour,price_wei,sample_count,source_count
        for (uint256 i = 1; i < lines.length; ++i) {
            string memory line = _withoutCarriageReturn(lines[i]);
            if (bytes(line).length == 0) continue;
            string[] memory field = vm.split(line, ",");
            lastPrice = vm.parseUint(field[2]);
            index.publish(
                _noonOf(field[0]), lastPrice, uint32(vm.parseUint(field[3])), uint16(vm.parseUint(field[4]))
            );
            ++prints;
        }
        console.log("backfilled prints", prints);
        console.log("last price       ", lastPrice);
    }

    /// @dev The CSV is written with CRLF line endings; splitting on LF leaves the CR behind.
    function _withoutCarriageReturn(string memory line) private pure returns (string memory) {
        bytes memory b = bytes(line);
        if (b.length == 0 || b[b.length - 1] != "\r") return line;
        bytes memory trimmed = new bytes(b.length - 1);
        for (uint256 i = 0; i < trimmed.length; ++i) {
            trimmed[i] = b[i];
        }
        return string(trimmed);
    }

    /// @dev Noon UTC on a YYYY-MM-DD date, as a unix timestamp.
    function _noonOf(string memory date) internal pure returns (uint64) {
        bytes memory b = bytes(date);
        require(b.length == 10 && b[4] == "-" && b[7] == "-", "Seed: bad date");
        uint256 year = _digits(b, 0, 4);
        uint256 month = _digits(b, 5, 2);
        uint256 day = _digits(b, 8, 2);
        return uint64(_daysFromCivil(year, month, day) * 1 days + 12 hours);
    }

    function _digits(bytes memory b, uint256 from, uint256 count) private pure returns (uint256 value) {
        for (uint256 i = from; i < from + count; ++i) {
            uint8 c = uint8(b[i]);
            require(c >= 48 && c <= 57, "Seed: bad digit");
            value = value * 10 + (c - 48);
        }
    }

    /// @dev Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm),
    ///      valid for any year from 1970 on.
    function _daysFromCivil(uint256 year, uint256 month, uint256 day) private pure returns (uint256) {
        if (month <= 2) year -= 1;
        uint256 era = year / 400;
        uint256 yearOfEra = year - era * 400;
        uint256 dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1;
        uint256 dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
        return era * 146_097 + dayOfEra - 719_468;
    }

    /// @dev One front-month contract whose delivery window opens now.
    function _listFrontContract(IngotMarket market) internal returns (uint256) {
        uint64 windowStart = uint64(block.timestamp);
        uint64 expiry = windowStart + 30 days;
        return market.listSeries(windowStart, expiry, 0);
    }

    function _capitalize(MockUSDC usdc, UnderwriterVault underwriter, HedgedCredit credit, address deployer)
        internal
    {
        usdc.mint(deployer, VAULT_CAPITAL + CREDIT_CAPITAL);

        usdc.approve(address(underwriter), VAULT_CAPITAL);
        underwriter.deposit(VAULT_CAPITAL);

        usdc.approve(address(credit), CREDIT_CAPITAL);
        credit.depositLender(CREDIT_CAPITAL);
    }
}
