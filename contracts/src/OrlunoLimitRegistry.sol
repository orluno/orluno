// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OrlunoRiskMath as R} from "./OrlunoRiskMath.sol";

interface IOrlunoFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

/// @title OrlunoLimitRegistry
/// @notice A public record of a trading strategy's configuration and the risk limits its owner set for it, plus a hash chain of
///         the paper-trading decisions the owner chose to anchor. It holds no funds, places no orders and has no admin, fee or
///         upgrade path. Anyone can ask checkTrade() whether a described trade stays inside a config's limits.
/// @dev Tightening a limit takes effect in the same block. Loosening any limit waits LOOSEN_DELAY (24 h), can be cancelled while
///      it waits, and becomes effective on its own once due (views read it lazily; the next write stores it).
contract OrlunoLimitRegistry {
    uint256 public constant LOOSEN_DELAY = 24 hours;

    // Reason bits from the registry itself; OrlunoRiskMath owns bits 0..5.
    uint256 public constant UNKNOWN_CONFIG = 1 << 8;
    uint256 public constant RETIRED = 1 << 9;
    uint256 public constant PRICE_BAD = 1 << 10;
    uint256 public constant PRICE_STALE = 1 << 11;

    struct Config {
        address owner;
        address asset;
        address feed;
        uint64 createdAt;
        uint32 version;
        bool retired;
        bytes32 configHash;
        R.Limits limits;
        // pending loosening
        bool hasPending;
        uint64 pendingAt;
        bytes32 pendingHash;
        R.Limits pending;
        // anchored paper decisions
        bytes32 head;
        uint64 lastTo;
        uint32 batches;
        uint64 decisions;
        uint64 trades;
    }

    uint256 public count;
    mapping(uint256 => Config) internal _configs;
    mapping(address => uint256[]) internal _byOwner;

    event ConfigRegistered(
        uint256 indexed id, address indexed owner, address indexed asset, address feed, bytes32 configHash, R.Limits limits
    );
    event LimitsChanged(uint256 indexed id, uint32 version, bytes32 configHash, R.Limits limits, bool fromQueue);
    event LooseningQueued(uint256 indexed id, uint64 effectiveAt, bytes32 configHash, R.Limits limits);
    event LooseningCancelled(uint256 indexed id);
    event ConfigRetired(uint256 indexed id);
    event BatchAnchored(
        uint256 indexed id,
        uint32 indexed batch,
        uint32 version,
        uint64 fromTs,
        uint64 toTs,
        uint32 decisions,
        uint32 trades,
        bytes32 batchRoot,
        bytes32 head
    );

    error UnknownConfig();
    error NotOwner();
    error IsRetired();
    error BadLimits();
    error BadHash();
    error BadAsset();
    error BadFeed();
    error NothingPending();
    error HeadMismatch();
    error BadWindow();
    error BadCounts();

    // ---------------------------------------------------------------- writes

    /// @notice Records a strategy config (its hash) for one asset and price feed with its first limits. Returns the config id.
    function register(bytes32 configHash, address asset, address feed, R.Limits calldata limits) external returns (uint256 id) {
        if (configHash == bytes32(0)) revert BadHash();
        if (!R.valid(limits)) revert BadLimits();
        if (asset.code.length == 0) revert BadAsset();
        if (!_feedOk(feed)) revert BadFeed();
        id = ++count;
        Config storage c = _configs[id];
        c.owner = msg.sender;
        c.asset = asset;
        c.feed = feed;
        c.createdAt = uint64(block.timestamp);
        c.version = 1;
        c.configHash = configHash;
        c.limits = limits;
        _byOwner[msg.sender].push(id);
        emit ConfigRegistered(id, msg.sender, asset, feed, configHash, limits);
    }

    /// @notice Changes the limits (and the config hash, when the strategy changed with them). Stricter or equal limits apply
    ///         now and drop any queued loosening; looser limits are queued for LOOSEN_DELAY.
    function setLimits(uint256 id, bytes32 configHash, R.Limits calldata limits) external {
        Config storage c = _owned(id);
        if (configHash == bytes32(0)) revert BadHash();
        if (!R.valid(limits)) revert BadLimits();
        _settle(id, c);
        if (R.loosens(c.limits, limits)) {
            c.hasPending = true;
            c.pendingAt = uint64(block.timestamp + LOOSEN_DELAY);
            c.pendingHash = configHash;
            c.pending = limits;
            emit LooseningQueued(id, c.pendingAt, configHash, limits);
        } else {
            if (c.hasPending) {
                delete c.pending;
                c.hasPending = false;
                c.pendingAt = 0;
                c.pendingHash = bytes32(0);
                emit LooseningCancelled(id);
            }
            c.limits = limits;
            c.configHash = configHash;
            c.version += 1;
            emit LimitsChanged(id, c.version, configHash, limits, false);
        }
    }

    /// @notice Drops a queued loosening before it is due.
    function cancelLoosening(uint256 id) external {
        Config storage c = _owned(id);
        _settle(id, c);
        if (!c.hasPending) revert NothingPending();
        delete c.pending;
        c.hasPending = false;
        c.pendingAt = 0;
        c.pendingHash = bytes32(0);
        emit LooseningCancelled(id);
    }

    /// @notice Stores a due loosening. Anyone may call it; views already treat a due loosening as effective.
    function settle(uint256 id) external {
        Config storage c = _configs[id];
        if (c.owner == address(0)) revert UnknownConfig();
        _settle(id, c);
    }

    /// @notice Retires a config for good. checkTrade then always answers RETIRED and no batch can be anchored.
    function retire(uint256 id) external {
        Config storage c = _owned(id);
        c.retired = true;
        emit ConfigRetired(id);
    }

    /// @notice Anchors one batch of paper decisions: `batchRoot` folds the decision hashes in order (see OrlunoRiskMath.fold),
    ///         `prevHead` must be the current head (so two tabs cannot both extend it), windows never overlap.
    function anchorBatch(
        uint256 id,
        uint64 fromTs,
        uint64 toTs,
        uint32 decisions,
        uint32 trades,
        bytes32 batchRoot,
        bytes32 prevHead
    ) external returns (bytes32 head) {
        Config storage c = _owned(id);
        _settle(id, c);
        if (prevHead != c.head) revert HeadMismatch();
        if (batchRoot == bytes32(0)) revert BadHash();
        if (toTs < fromTs || toTs > block.timestamp || (c.batches > 0 && fromTs <= c.lastTo)) revert BadWindow();
        if (decisions == 0 || trades > decisions) revert BadCounts();
        head = R.link(c.head, batchRoot, fromTs, toTs, decisions, trades);
        c.head = head;
        c.lastTo = toTs;
        c.batches += 1;
        c.decisions += decisions;
        c.trades += trades;
        emit BatchAnchored(id, c.batches, c.version, fromTs, toTs, decisions, trades, batchRoot, head);
    }

    // ---------------------------------------------------------------- views

    /// @notice Reason bits for a described trade under config `id` right now (0 = inside every limit). Reads the config's price
    ///         feed: a failed or non-positive answer sets PRICE_BAD, an answer older than maxPriceAge sets PRICE_STALE.
    function checkTrade(uint256 id, R.Trade calldata t) external view returns (uint256 bits) {
        Config storage c = _configs[id];
        if (c.owner == address(0)) return UNKNOWN_CONFIG;
        if (c.retired) bits |= RETIRED;
        R.Limits memory l = _effective(c);
        (bool ok, uint256 updatedAt) = _readFeed(c.feed);
        if (!ok) bits |= PRICE_BAD;
        else if (block.timestamp - updatedAt > l.maxPriceAge) bits |= PRICE_STALE;
        bits |= R.check(l, t);
    }

    /// @notice The pure limit check without the feed and the config (same bits 0..5 as checkTrade).
    function checkLimits(R.Limits calldata l, R.Trade calldata t) external pure returns (uint256) {
        return R.check(l, t);
    }

    function effectiveLimits(uint256 id) external view returns (R.Limits memory) {
        Config storage c = _configs[id];
        if (c.owner == address(0)) revert UnknownConfig();
        return _effective(c);
    }

    function getConfig(uint256 id) external view returns (Config memory) {
        Config memory c = _configs[id];
        if (c.owner == address(0)) revert UnknownConfig();
        return c;
    }

    function configsOf(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }

    function decisionLeaf(uint64 t, uint256 price, uint8 action, uint256 reasons, uint16 positionBps)
        external
        pure
        returns (bytes32)
    {
        return R.leaf(t, price, action, reasons, positionBps);
    }

    function foldLeaves(bytes32[] calldata leaves) external pure returns (bytes32) {
        return R.fold(leaves);
    }

    /// @notice Recomputes the head a batch would produce, so anyone holding the decision list can check an anchored batch.
    function linkHead(bytes32 head, bytes32 batchRoot, uint64 fromTs, uint64 toTs, uint32 decisions, uint32 trades)
        external
        pure
        returns (bytes32)
    {
        return R.link(head, batchRoot, fromTs, toTs, decisions, trades);
    }

    // ---------------------------------------------------------------- internals

    function _owned(uint256 id) internal view returns (Config storage c) {
        c = _configs[id];
        if (c.owner == address(0)) revert UnknownConfig();
        if (c.owner != msg.sender) revert NotOwner();
        if (c.retired) revert IsRetired();
    }

    function _effective(Config storage c) internal view returns (R.Limits memory) {
        if (c.hasPending && block.timestamp >= c.pendingAt) return c.pending;
        return c.limits;
    }

    function _settle(uint256 id, Config storage c) internal {
        if (c.hasPending && block.timestamp >= c.pendingAt) {
            c.limits = c.pending;
            c.configHash = c.pendingHash;
            delete c.pending;
            c.hasPending = false;
            c.pendingAt = 0;
            c.pendingHash = bytes32(0);
            c.version += 1;
            emit LimitsChanged(id, c.version, c.configHash, c.limits, true);
        }
    }

    function _feedOk(address feed) internal view returns (bool) {
        if (feed.code.length == 0) return false;
        try IOrlunoFeed(feed).decimals() returns (uint8 d) {
            if (d != 8) return false;
        } catch {
            return false;
        }
        (bool ok,) = _readFeed(feed);
        return ok;
    }

    function _readFeed(address feed) internal view returns (bool ok, uint256 updatedAt) {
        try IOrlunoFeed(feed).latestRoundData() returns (uint80, int256 answer, uint256, uint256 u, uint80) {
            if (answer <= 0 || u == 0 || u > block.timestamp) return (false, 0);
            return (true, u);
        } catch {
            return (false, 0);
        }
    }
}
