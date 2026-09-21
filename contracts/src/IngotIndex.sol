// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IIngotIndex} from "./interfaces/IIngotIndex.sol";

/// @title IngotIndex
/// @notice Onchain rental-rate index for a standardized compute unit (e.g. one NVIDIA H100,
///         on-demand, USD per GPU-hour). Markets and credit lines settle against this contract.
///
/// @dev Design notes, because an index is only as good as the rules around it:
///
///      1. Observations are published by an allowlisted set of publishers, each print carrying the
///         hash of the methodology that produced it plus the sample and venue counts behind it.
///         The methodology is therefore auditable from chain state alone.
///
///      2. A print is *provisional* for `finalityDelay` seconds. Settlement reads only finalized
///         prints, so a bad print can be revoked by the guardian before any money moves against it.
///         Revocation is restricted to still-provisional prints at the tip of the history, which
///         keeps the cumulative series append-only and consistent.
///
///      3. A print further than `maxDeviationBps` from the previous one is rejected outright. Real
///         GPU rental rates are volatile but not discontinuous; a 20x jump is a broken scraper, not
///         a market move. The guardian can widen the band deliberately if a genuine repricing event
///         occurs.
///
///      4. Averages are computed from a cumulative price-seconds series, so an average over any
///         window costs two lookups rather than a loop over the window. The price is treated as a
///         step function that holds until the next print, which matches how rental rates are quoted.
contract IngotIndex is IIngotIndex, Ownable {
    /// @param timestamp Time the price refers to (not necessarily the block time of the print).
    /// @param price USD per GPU-hour, 18 decimals.
    /// @param cumulative Cumulative price-seconds from genesis up to `timestamp`.
    /// @param publishedAt Block time the print landed, used to decide finality.
    /// @param sampleCount Number of individual venue quotes behind the print.
    /// @param sourceCount Number of distinct venues behind the print.
    struct Observation {
        uint64 timestamp;
        uint64 publishedAt;
        uint32 sampleCount;
        uint16 sourceCount;
        uint256 price;
        uint256 cumulative;
    }

    /// @notice Human-readable unit this index prices, e.g. "H100-SXM-80GB on-demand, USD/GPU-hour".
    string public unit;

    /// @notice Hash of the currently published methodology document.
    bytes32 public methodologyHash;

    /// @notice Seconds a print stays provisional before settlement may read it.
    uint32 public finalityDelay;

    /// @notice Maximum move between consecutive prints, in basis points.
    uint16 public maxDeviationBps;

    /// @notice Minimum spacing between prints, in seconds.
    uint32 public minInterval;

    /// @notice Address permitted to revoke provisional prints and retune guards.
    address public guardian;

    mapping(address publisher => bool allowed) public isPublisher;

    Observation[] internal _observations;

    event Published(
        uint256 indexed id, uint64 timestamp, uint256 price, uint32 sampleCount, uint16 sourceCount
    );
    event Revoked(uint256 indexed id, uint64 timestamp, uint256 price, string reason);
    event PublisherSet(address indexed publisher, bool allowed);
    event GuardianSet(address indexed guardian);
    event MethodologySet(bytes32 indexed methodologyHash, string uri);
    event GuardsSet(uint32 finalityDelay, uint16 maxDeviationBps, uint32 minInterval);

    error NotPublisher();
    error NotGuardian();
    error ZeroPrice();
    error TimestampNotAdvancing();
    error TimestampInFuture();
    error TooSoon();
    error DeviationTooLarge(uint256 previous, uint256 submitted, uint16 limitBps);
    error NoObservations();
    error NothingToRevoke();
    error AlreadyFinalized();
    error WindowNotFinalized(uint64 requested, uint64 finalizedThrough_);
    error BadWindow();
    error WindowBeforeGenesis();
    error InvalidParameter();

    modifier onlyPublisher() {
        if (!isPublisher[msg.sender]) revert NotPublisher();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    /// @param unit_ Description of the priced unit.
    /// @param methodologyHash_ Hash of the methodology document in force at deployment.
    /// @param methodologyUri Where that document can be read.
    /// @param owner_ Owner, able to manage publishers and the guardian.
    constructor(
        string memory unit_,
        bytes32 methodologyHash_,
        string memory methodologyUri,
        address owner_
    ) Ownable(owner_) {
        unit = unit_;
        methodologyHash = methodologyHash_;
        guardian = owner_;
        finalityDelay = 1 hours;
        maxDeviationBps = 2_500; // 25% between consecutive prints
        minInterval = 5 minutes;

        emit MethodologySet(methodologyHash_, methodologyUri);
        emit GuardianSet(owner_);
        emit GuardsSet(1 hours, 2_500, 5 minutes);
    }

    // ---------------------------------------------------------------------
    // Publishing
    // ---------------------------------------------------------------------

    /// @notice Record a new index print.
    /// @param observedAt Time the price refers to; must advance and may not be in the future.
    /// @param price USD per GPU-hour, 18 decimals.
    /// @param sampleCount Individual venue quotes behind the print.
    /// @param sourceCount Distinct venues behind the print.
    function publish(uint64 observedAt, uint256 price, uint32 sampleCount, uint16 sourceCount)
        external
        onlyPublisher
        returns (uint256 id)
    {
        if (price == 0) revert ZeroPrice();
        if (observedAt > block.timestamp) revert TimestampInFuture();

        uint256 length = _observations.length;
        uint256 cumulative;

        if (length == 0) {
            cumulative = 0;
        } else {
            Observation storage previous = _observations[length - 1];
            if (observedAt <= previous.timestamp) revert TimestampNotAdvancing();
            uint64 elapsed = observedAt - previous.timestamp;
            if (elapsed < minInterval) revert TooSoon();

            uint256 limit = maxDeviationBps;
            uint256 previousPrice = previous.price;
            uint256 delta = price > previousPrice ? price - previousPrice : previousPrice - price;
            if (delta * 10_000 > previousPrice * limit) {
                revert DeviationTooLarge(previousPrice, price, maxDeviationBps);
            }

            // The previous price held from its timestamp until this one.
            cumulative = previous.cumulative + previousPrice * elapsed;
        }

        id = length;
        _observations.push(
            Observation({
                timestamp: observedAt,
                publishedAt: uint64(block.timestamp),
                sampleCount: sampleCount,
                sourceCount: sourceCount,
                price: price,
                cumulative: cumulative
            })
        );

        emit Published(id, observedAt, price, sampleCount, sourceCount);
    }

    /// @notice Drop the newest print while it is still provisional.
    /// @dev Only the tip may be revoked, which keeps the cumulative series append-only. Call
    ///      repeatedly to unwind several provisional prints.
    function revokeLatest(string calldata reason) external onlyGuardian {
        uint256 length = _observations.length;
        if (length == 0) revert NothingToRevoke();

        Observation memory tip = _observations[length - 1];
        if (block.timestamp >= tip.publishedAt + finalityDelay) revert AlreadyFinalized();

        _observations.pop();
        emit Revoked(length - 1, tip.timestamp, tip.price, reason);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    /// @inheritdoc IIngotIndex
    function latest() public view returns (uint256 price, uint64 observedAt) {
        uint256 index = _finalizedTip();
        Observation storage observation = _observations[index];
        return (observation.price, observation.timestamp);
    }

    /// @inheritdoc IIngotIndex
    function finalizedThrough() public view returns (uint64) {
        return _observations[_finalizedTip()].timestamp;
    }

    /// @inheritdoc IIngotIndex
    function averageBetween(uint64 from, uint64 to) public view returns (uint256) {
        if (to <= from) revert BadWindow();

        uint64 horizon = finalizedThrough();
        if (to > horizon) revert WindowNotFinalized(to, horizon);
        if (from < _observations[0].timestamp) revert WindowBeforeGenesis();

        uint256 start = _cumulativeAt(from);
        uint256 end = _cumulativeAt(to);
        return (end - start) / (to - from);
    }

    /// @inheritdoc IIngotIndex
    function twap(uint32 window) external view returns (uint256) {
        if (window == 0) revert BadWindow();
        uint64 to = finalizedThrough();
        if (to <= window) revert WindowBeforeGenesis();
        return averageBetween(to - window, to);
    }

    /// @notice Total number of prints held, including provisional ones.
    function observationCount() external view returns (uint256) {
        return _observations.length;
    }

    /// @notice Read a print by id, including provisional ones.
    function observation(uint256 id) external view returns (Observation memory) {
        return _observations[id];
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    function setPublisher(address publisher, bool allowed) external onlyOwner {
        isPublisher[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function setMethodology(bytes32 methodologyHash_, string calldata uri) external onlyOwner {
        methodologyHash = methodologyHash_;
        emit MethodologySet(methodologyHash_, uri);
    }

    /// @notice Retune the publishing guards.
    /// @dev Guardian-held rather than owner-held so a genuine repricing event can be accommodated
    ///      quickly, e.g. widening the deviation band around a hardware launch.
    function setGuards(uint32 finalityDelay_, uint16 maxDeviationBps_, uint32 minInterval_)
        external
        onlyGuardian
    {
        if (maxDeviationBps_ == 0 || maxDeviationBps_ > 10_000) revert InvalidParameter();
        if (finalityDelay_ > 1 days) revert InvalidParameter();
        finalityDelay = finalityDelay_;
        maxDeviationBps = maxDeviationBps_;
        minInterval = minInterval_;
        emit GuardsSet(finalityDelay_, maxDeviationBps_, minInterval_);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Index of the newest print old enough to be considered final.
    function _finalizedTip() internal view returns (uint256) {
        uint256 length = _observations.length;
        if (length == 0) revert NoObservations();

        uint256 cutoff = block.timestamp;
        unchecked {
            for (uint256 i = length; i > 0; --i) {
                Observation storage candidate = _observations[i - 1];
                if (candidate.publishedAt + finalityDelay <= cutoff) return i - 1;
            }
        }
        revert NoObservations();
    }

    /// @dev Cumulative price-seconds at an arbitrary time within the recorded history.
    function _cumulativeAt(uint64 timestamp) internal view returns (uint256) {
        uint256 index = _search(timestamp);
        Observation storage observation_ = _observations[index];
        return observation_.cumulative + observation_.price * (timestamp - observation_.timestamp);
    }

    /// @dev Index of the newest print at or before `timestamp`. Caller guarantees the timestamp is
    ///      at or after genesis and within the finalized range.
    function _search(uint64 timestamp) internal view returns (uint256) {
        uint256 low = 0;
        uint256 high = _finalizedTip();

        while (low < high) {
            uint256 mid = (low + high + 1) >> 1;
            if (_observations[mid].timestamp <= timestamp) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return low;
    }
}
