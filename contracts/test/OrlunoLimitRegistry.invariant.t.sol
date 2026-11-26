// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OrlunoLimitRegistry} from "../src/OrlunoLimitRegistry.sol";
import {OrlunoRiskMath as R} from "../src/OrlunoRiskMath.sol";
import {OrlunoMockFeed, OrlunoMockAsset} from "./OrlunoMocks.sol";

/// Drives the registry with random owners, limit changes, waits and anchors, and keeps its own copy of what must be true.
contract OrlunoHandler is Test {
    OrlunoLimitRegistry public reg;
    OrlunoMockFeed public feed;
    OrlunoMockAsset public asset;
    address[3] public owners = [address(0x1001), address(0x1002), address(0x1003)];

    // ghosts per config id
    mapping(uint256 => bytes32) public ghostHead;
    mapping(uint256 => uint32) public ghostBatches;
    mapping(uint256 => uint64) public ghostLastTo;
    mapping(uint256 => uint32) public lastVersion;
    mapping(uint256 => uint16) public ghostActivePos; // maxPositionBps that must be in force until ghostDueAt
    mapping(uint256 => uint64) public ghostDueAt;
    mapping(uint256 => uint16) public ghostQueuedPos;
    uint256 public calls;

    constructor() {
        vm.warp(1_800_000_000);
        reg = new OrlunoLimitRegistry();
        feed = new OrlunoMockFeed();
        asset = new OrlunoMockAsset();
        feed.set(1e11, block.timestamp);
    }

    function _lim(uint16 pos) internal pure returns (R.Limits memory) {
        return R.Limits(pos, 300, 4, 50, 1 days);
    }

    function register(uint8 who, uint16 pos) external {
        pos = uint16(bound(pos, 1, 10_000));
        vm.prank(owners[who % 3]);
        uint256 id = reg.register(keccak256(abi.encode(pos, calls)), address(asset), address(feed), _lim(pos));
        ghostActivePos[id] = pos;
        lastVersion[id] = 1;
        calls++;
    }

    function setPos(uint256 idSeed, uint16 pos) external {
        if (reg.count() == 0) return;
        uint256 id = bound(idSeed, 1, reg.count());
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        if (c.retired) return;
        pos = uint16(bound(pos, 1, 10_000));
        _absorbDue(id);
        uint16 cur = ghostActivePos[id];
        vm.prank(c.owner);
        reg.setLimits(id, keccak256(abi.encode(pos, calls)), _lim(pos));
        if (pos > cur) {
            ghostQueuedPos[id] = pos;
            ghostDueAt[id] = uint64(block.timestamp + 24 hours);
        } else {
            ghostActivePos[id] = pos;
            ghostDueAt[id] = 0;
        }
        calls++;
    }

    function cancel(uint256 idSeed) external {
        if (reg.count() == 0) return;
        uint256 id = bound(idSeed, 1, reg.count());
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        if (c.retired) return;
        _absorbDue(id);
        if (ghostDueAt[id] == 0) return;
        vm.prank(c.owner);
        reg.cancelLoosening(id);
        ghostDueAt[id] = 0;
        calls++;
    }

    function anchor(uint256 idSeed, uint32 decisions, uint32 trades, uint32 span) external {
        if (reg.count() == 0) return;
        uint256 id = bound(idSeed, 1, reg.count());
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        if (c.retired) return;
        _absorbDue(id);
        decisions = uint32(bound(decisions, 1, 500));
        trades = uint32(bound(trades, 0, decisions));
        uint64 from = ghostBatches[id] == 0 ? uint64(block.timestamp - 10 days) : ghostLastTo[id] + 1;
        if (from > block.timestamp) return;
        uint64 to = uint64(bound(span, from, block.timestamp));
        bytes32 root = keccak256(abi.encode(id, calls));
        vm.prank(c.owner);
        reg.anchorBatch(id, from, to, decisions, trades, root, ghostHead[id]);
        ghostHead[id] = keccak256(abi.encode(ghostHead[id], root, from, to, decisions, trades));
        ghostBatches[id] += 1;
        ghostLastTo[id] = to;
        calls++;
    }

    function retire(uint256 idSeed) external {
        if (reg.count() == 0) return;
        uint256 id = bound(idSeed, 1, reg.count());
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        if (c.retired) return;
        vm.prank(c.owner);
        reg.retire(id);
    }

    function wait(uint32 s) external {
        vm.warp(block.timestamp + bound(s, 1, 2 days));
        feed.set(1e11, block.timestamp);
    }

    function _absorbDue(uint256 id) internal {
        if (ghostDueAt[id] != 0 && block.timestamp >= ghostDueAt[id]) {
            ghostActivePos[id] = ghostQueuedPos[id];
            ghostDueAt[id] = 0;
        }
    }

    function expectedPos(uint256 id) external view returns (uint16) {
        if (ghostDueAt[id] != 0 && block.timestamp >= ghostDueAt[id]) return ghostQueuedPos[id];
        return ghostActivePos[id];
    }

    function bumpVersion(uint256 id, uint32 v) external {
        lastVersion[id] = v;
    }
}

contract OrlunoLimitRegistryInvariantTest is Test {
    OrlunoHandler h;

    function setUp() public {
        h = new OrlunoHandler();
        targetContract(address(h));
    }

    /// The limit in force is always the ghost's: a loosening is never effective before its delay, a tightening is immediate.
    function invariant_effective_limit_matches_model() public view {
        OrlunoLimitRegistry reg = h.reg();
        for (uint256 id = 1; id <= reg.count(); id++) {
            assertEq(reg.effectiveLimits(id).maxPositionBps, h.expectedPos(id));
        }
    }

    /// The anchored head is exactly the hash chain of every accepted batch, and windows only move forward.
    function invariant_anchor_chain_matches_model() public view {
        OrlunoLimitRegistry reg = h.reg();
        for (uint256 id = 1; id <= reg.count(); id++) {
            OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
            assertEq(c.head, h.ghostHead(id));
            assertEq(c.batches, h.ghostBatches(id));
            assertEq(c.lastTo, h.ghostLastTo(id));
            assertLe(c.trades, c.decisions);
        }
    }

    /// A sell is never refused by position, daily loss or trade count, whatever the config.
    function invariant_sells_never_trapped() public view {
        OrlunoLimitRegistry reg = h.reg();
        for (uint256 id = 1; id <= reg.count(); id++) {
            uint256 bits = reg.checkTrade(id, R.Trade(R.SIDE_SELL, 10_000, 10_000, 255, 0));
            assertEq(bits & (R.POSITION_OVER | R.DAILY_LOSS_HIT | R.TRADES_PER_DAY_HIT), 0);
        }
    }

    /// The registry never holds ether.
    function invariant_no_balance() public view {
        assertEq(address(h.reg()).balance, 0);
    }
}
