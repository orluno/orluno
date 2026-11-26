// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OrlunoLimitRegistry} from "../src/OrlunoLimitRegistry.sol";
import {OrlunoRiskMath as R} from "../src/OrlunoRiskMath.sol";
import {OrlunoMockFeed, OrlunoMockAsset} from "./OrlunoMocks.sol";

contract OrlunoLimitRegistryTest is Test {
    OrlunoLimitRegistry reg;
    OrlunoMockFeed feed;
    OrlunoMockAsset asset;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    bytes32 constant H1 = keccak256("config-1");
    bytes32 constant H2 = keccak256("config-2");

    function setUp() public {
        vm.warp(1_800_000_000);
        reg = new OrlunoLimitRegistry();
        feed = new OrlunoMockFeed();
        feed.set(300_000_000_000, block.timestamp);
        asset = new OrlunoMockAsset();
    }

    function lim(uint16 pos, uint16 loss, uint8 trades, uint16 slip, uint32 age) internal pure returns (R.Limits memory) {
        return R.Limits(pos, loss, trades, slip, age);
    }

    function base() internal pure returns (R.Limits memory) {
        return lim(5_000, 300, 4, 50, 1 days);
    }

    function buy(uint16 pos, uint16 loss, uint8 trades, uint16 slip) internal pure returns (R.Trade memory) {
        return R.Trade(R.SIDE_BUY, pos, loss, trades, slip);
    }

    function sell(uint16 pos, uint16 loss, uint8 trades, uint16 slip) internal pure returns (R.Trade memory) {
        return R.Trade(R.SIDE_SELL, pos, loss, trades, slip);
    }

    function registered() internal returns (uint256 id) {
        vm.prank(alice);
        id = reg.register(H1, address(asset), address(feed), base());
    }

    // ------------------------------------------------------------ register

    function test_register_records_everything() public {
        uint256 id = registered();
        assertEq(id, 1);
        assertEq(reg.count(), 1);
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        assertEq(c.owner, alice);
        assertEq(c.asset, address(asset));
        assertEq(c.feed, address(feed));
        assertEq(c.configHash, H1);
        assertEq(c.version, 1);
        assertEq(c.limits.maxPositionBps, 5_000);
        assertEq(c.createdAt, block.timestamp);
        uint256[] memory mine = reg.configsOf(alice);
        assertEq(mine.length, 1);
        assertEq(mine[0], id);
    }

    function test_register_refuses_bad_inputs() public {
        vm.startPrank(alice);
        vm.expectRevert(OrlunoLimitRegistry.BadHash.selector);
        reg.register(bytes32(0), address(asset), address(feed), base());
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(0, 300, 4, 50, 1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(10_001, 300, 4, 50, 1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(5_000, 0, 4, 50, 1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(5_000, 300, 0, 50, 1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(5_000, 300, 97, 50, 1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(5_000, 300, 4, 1_001, 1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(5_000, 300, 4, 50, 59));
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.register(H1, address(asset), address(feed), lim(5_000, 300, 4, 50, 7 days + 1));
        vm.expectRevert(OrlunoLimitRegistry.BadAsset.selector);
        reg.register(H1, address(0x1234), address(feed), base());
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(H1, address(asset), address(asset), base()); // has code, no feed functions
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(H1, address(asset), address(0x9999), base()); // no code
        vm.stopPrank();
        feed.setDecimals(18);
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(H1, address(asset), address(feed), base());
        feed.setDecimals(8);
        feed.set(0, block.timestamp);
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(H1, address(asset), address(feed), base());
        feed.set(1, block.timestamp + 1); // from the future
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(H1, address(asset), address(feed), base());
        feed.set(1, block.timestamp);
        feed.setBroken(true);
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(H1, address(asset), address(feed), base());
    }

    function test_register_emits() public {
        vm.expectEmit(true, true, true, true);
        emit OrlunoLimitRegistry.ConfigRegistered(1, alice, address(asset), address(feed), H1, base());
        registered();
    }

    // ------------------------------------------------------------ checkTrade

    function test_checkTrade_inside_limits_is_zero() public {
        uint256 id = registered();
        assertEq(reg.checkTrade(id, buy(5_000, 299, 3, 50)), 0);
        assertEq(reg.checkTrade(id, sell(0, 0, 0, 0)), 0);
    }

    function test_checkTrade_each_bit() public {
        uint256 id = registered();
        assertEq(reg.checkTrade(id, buy(5_001, 0, 0, 0)), R.POSITION_OVER);
        assertEq(reg.checkTrade(id, buy(1, 300, 0, 0)), R.DAILY_LOSS_HIT);
        assertEq(reg.checkTrade(id, buy(1, 0, 4, 0)), R.TRADES_PER_DAY_HIT);
        assertEq(reg.checkTrade(id, buy(1, 0, 0, 51)), R.SLIPPAGE_OVER);
        assertEq(reg.checkTrade(id, buy(10_001, 0, 0, 0)), R.POSITION_BAD | R.POSITION_OVER);
        assertEq(reg.checkTrade(id, R.Trade(0, 0, 0, 0, 0)), R.BAD_SIDE);
        assertEq(reg.checkTrade(id, R.Trade(3, 0, 0, 0, 0)), R.BAD_SIDE);
        assertEq(reg.checkTrade(id, buy(9_000, 900, 9, 99)), R.POSITION_OVER | R.DAILY_LOSS_HIT | R.TRADES_PER_DAY_HIT | R.SLIPPAGE_OVER);
    }

    function test_sells_are_never_trapped() public {
        uint256 id = registered();
        // Over position, over daily loss, over trade count: a sell still passes.
        assertEq(reg.checkTrade(id, sell(4_000, 9_999, 90, 0)), 0);
        // Slippage still applies to sells.
        assertEq(reg.checkTrade(id, sell(0, 0, 0, 51)), R.SLIPPAGE_OVER);
    }

    function test_checkTrade_unknown_retired_and_feed() public {
        assertEq(reg.checkTrade(7, buy(1, 0, 0, 0)), reg.UNKNOWN_CONFIG());
        uint256 id = registered();
        vm.warp(block.timestamp + 1 days + 1);
        assertEq(reg.checkTrade(id, buy(1, 0, 0, 0)), reg.PRICE_STALE());
        feed.set(-5, block.timestamp);
        assertEq(reg.checkTrade(id, buy(1, 0, 0, 0)), reg.PRICE_BAD());
        feed.set(5, block.timestamp);
        feed.setBroken(true);
        assertEq(reg.checkTrade(id, buy(1, 0, 0, 0)), reg.PRICE_BAD());
        feed.setBroken(false);
        vm.prank(alice);
        reg.retire(id);
        assertEq(reg.checkTrade(id, buy(1, 0, 0, 0)), reg.RETIRED());
    }

    function test_checkLimits_matches_checkTrade_core() public {
        uint256 id = registered();
        R.Trade memory t = buy(6_000, 500, 1, 0);
        assertEq(reg.checkLimits(base(), t), reg.checkTrade(id, t));
    }

    // ------------------------------------------------------------ limits changes

    function test_tightening_is_immediate() public {
        uint256 id = registered();
        vm.prank(alice);
        reg.setLimits(id, H2, lim(2_000, 200, 2, 20, 1 hours));
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        assertEq(c.version, 2);
        assertEq(c.configHash, H2);
        assertEq(c.limits.maxPositionBps, 2_000);
        assertEq(reg.checkTrade(id, buy(2_001, 0, 0, 0)), R.POSITION_OVER);
    }

    function test_loosening_waits_the_delay() public {
        uint256 id = registered();
        vm.prank(alice);
        reg.setLimits(id, H2, lim(9_000, 300, 4, 50, 1 days));
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        assertTrue(c.hasPending);
        assertEq(c.pendingAt, block.timestamp + 24 hours);
        assertEq(c.version, 1);
        assertEq(reg.checkTrade(id, buy(8_000, 0, 0, 0)), R.POSITION_OVER); // still the old limit
        vm.warp(block.timestamp + 24 hours - 1);
        feed.set(1, block.timestamp);
        assertEq(reg.checkTrade(id, buy(8_000, 0, 0, 0)), R.POSITION_OVER);
        vm.warp(block.timestamp + 1);
        feed.set(1, block.timestamp);
        assertEq(reg.checkTrade(id, buy(8_000, 0, 0, 0)), 0); // due: effective lazily
        assertEq(reg.effectiveLimits(id).maxPositionBps, 9_000);
        reg.settle(id); // anyone
        c = reg.getConfig(id);
        assertFalse(c.hasPending);
        assertEq(c.version, 2);
        assertEq(c.configHash, H2);
    }

    function test_loosening_one_field_while_tightening_another_still_waits() public {
        uint256 id = registered();
        vm.prank(alice);
        reg.setLimits(id, H2, lim(1_000, 300, 4, 50, 2 days)); // tighter position, looser price age
        assertTrue(reg.getConfig(id).hasPending);
        assertEq(reg.getConfig(id).limits.maxPositionBps, 5_000);
    }

    function test_tightening_drops_a_queued_loosening() public {
        uint256 id = registered();
        vm.startPrank(alice);
        reg.setLimits(id, H2, lim(9_000, 300, 4, 50, 1 days));
        reg.setLimits(id, H1, lim(4_000, 300, 4, 50, 1 days));
        vm.stopPrank();
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        assertFalse(c.hasPending);
        assertEq(c.limits.maxPositionBps, 4_000);
        vm.warp(block.timestamp + 2 days);
        feed.set(1, block.timestamp);
        assertEq(reg.effectiveLimits(id).maxPositionBps, 4_000);
    }

    function test_requeue_restarts_the_timer() public {
        uint256 id = registered();
        vm.prank(alice);
        reg.setLimits(id, H2, lim(9_000, 300, 4, 50, 1 days));
        vm.warp(block.timestamp + 23 hours);
        vm.prank(alice);
        reg.setLimits(id, H2, lim(9_500, 300, 4, 50, 1 days));
        assertEq(reg.getConfig(id).pendingAt, block.timestamp + 24 hours);
    }

    function test_cancel_loosening() public {
        uint256 id = registered();
        vm.startPrank(alice);
        vm.expectRevert(OrlunoLimitRegistry.NothingPending.selector);
        reg.cancelLoosening(id);
        reg.setLimits(id, H2, lim(9_000, 300, 4, 50, 1 days));
        reg.cancelLoosening(id);
        vm.stopPrank();
        vm.warp(block.timestamp + 3 days);
        feed.set(1, block.timestamp);
        assertEq(reg.effectiveLimits(id).maxPositionBps, 5_000);
    }

    function test_due_loosening_cannot_be_cancelled_after_it_applied() public {
        uint256 id = registered();
        vm.prank(alice);
        reg.setLimits(id, H2, lim(9_000, 300, 4, 50, 1 days));
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        vm.expectRevert(OrlunoLimitRegistry.NothingPending.selector);
        reg.cancelLoosening(id); // a due loosening already counts as applied: nothing left to cancel
        assertEq(reg.effectiveLimits(id).maxPositionBps, 9_000);
    }

    function test_only_owner_writes() public {
        uint256 id = registered();
        vm.startPrank(bob);
        vm.expectRevert(OrlunoLimitRegistry.NotOwner.selector);
        reg.setLimits(id, H2, base());
        vm.expectRevert(OrlunoLimitRegistry.NotOwner.selector);
        reg.retire(id);
        vm.expectRevert(OrlunoLimitRegistry.NotOwner.selector);
        reg.cancelLoosening(id);
        vm.expectRevert(OrlunoLimitRegistry.NotOwner.selector);
        reg.anchorBatch(id, 1, 2, 1, 0, H1, bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.UnknownConfig.selector);
        reg.setLimits(99, H2, base());
        vm.expectRevert(OrlunoLimitRegistry.UnknownConfig.selector);
        reg.settle(99);
        vm.expectRevert(OrlunoLimitRegistry.UnknownConfig.selector);
        reg.getConfig(99);
        vm.expectRevert(OrlunoLimitRegistry.UnknownConfig.selector);
        reg.effectiveLimits(99);
        vm.stopPrank();
    }

    function test_setLimits_validates() public {
        uint256 id = registered();
        vm.startPrank(alice);
        vm.expectRevert(OrlunoLimitRegistry.BadHash.selector);
        reg.setLimits(id, bytes32(0), base());
        vm.expectRevert(OrlunoLimitRegistry.BadLimits.selector);
        reg.setLimits(id, H2, lim(0, 1, 1, 0, 60));
        vm.stopPrank();
    }

    function test_retired_is_final() public {
        uint256 id = registered();
        vm.startPrank(alice);
        reg.retire(id);
        vm.expectRevert(OrlunoLimitRegistry.IsRetired.selector);
        reg.setLimits(id, H2, base());
        vm.expectRevert(OrlunoLimitRegistry.IsRetired.selector);
        reg.anchorBatch(id, 1, 2, 1, 0, H1, bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.IsRetired.selector);
        reg.retire(id);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ anchoring

    function test_anchor_chain() public {
        uint256 id = registered();
        bytes32[] memory leaves = new bytes32[](3);
        leaves[0] = reg.decisionLeaf(1_799_996_400, 300_000_000_000, 0, 0, 0);
        leaves[1] = reg.decisionLeaf(1_799_998_000, 301_000_000_000, 2, 0, 5_000);
        leaves[2] = reg.decisionLeaf(1_799_999_000, 302_000_000_000, 1, 0, 5_000);
        bytes32 root = reg.foldLeaves(leaves);
        assertEq(root, keccak256(abi.encodePacked(keccak256(abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), leaves[0])), leaves[1])), leaves[2])));
        vm.prank(alice);
        bytes32 h1 = reg.anchorBatch(id, 1_799_996_400, 1_799_999_000, 3, 1, root, bytes32(0));
        assertEq(h1, reg.linkHead(bytes32(0), root, 1_799_996_400, 1_799_999_000, 3, 1));
        OrlunoLimitRegistry.Config memory c = reg.getConfig(id);
        assertEq(c.head, h1);
        assertEq(c.batches, 1);
        assertEq(c.decisions, 3);
        assertEq(c.trades, 1);
        assertEq(c.lastTo, 1_799_999_000);
        // second batch must start after the first and extend the current head
        vm.startPrank(alice);
        vm.expectRevert(OrlunoLimitRegistry.HeadMismatch.selector);
        reg.anchorBatch(id, 1_799_999_001, 1_800_000_000, 1, 0, root, bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.BadWindow.selector);
        reg.anchorBatch(id, 1_799_999_000, 1_800_000_000, 1, 0, root, h1);
        bytes32 h2 = reg.anchorBatch(id, 1_799_999_001, 1_800_000_000, 1, 0, root, h1);
        vm.stopPrank();
        assertEq(reg.getConfig(id).batches, 2);
        assertTrue(h2 != h1);
    }

    function test_anchor_validates() public {
        uint256 id = registered();
        vm.startPrank(alice);
        vm.expectRevert(OrlunoLimitRegistry.BadHash.selector);
        reg.anchorBatch(id, 1, 2, 1, 0, bytes32(0), bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.BadWindow.selector);
        reg.anchorBatch(id, 3, 2, 1, 0, H1, bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.BadWindow.selector);
        reg.anchorBatch(id, 1, uint64(block.timestamp + 1), 1, 0, H1, bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.BadCounts.selector);
        reg.anchorBatch(id, 1, 2, 0, 0, H1, bytes32(0));
        vm.expectRevert(OrlunoLimitRegistry.BadCounts.selector);
        reg.anchorBatch(id, 1, 2, 1, 2, H1, bytes32(0));
        vm.stopPrank();
    }

    function test_anchor_records_version_after_settling() public {
        uint256 id = registered();
        vm.prank(alice);
        reg.setLimits(id, H2, lim(9_000, 300, 4, 50, 1 days));
        vm.warp(block.timestamp + 25 hours);
        vm.expectEmit(true, true, false, true);
        emit OrlunoLimitRegistry.BatchAnchored(id, 1, 2, 1, 2, 1, 0, H1, reg.linkHead(bytes32(0), H1, 1, 2, 1, 0));
        vm.prank(alice);
        reg.anchorBatch(id, 1, 2, 1, 0, H1, bytes32(0));
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_sells_only_refused_for_slippage_or_side(uint16 pos, uint16 loss, uint8 trades, uint16 slip) public {
        uint256 id = registered();
        pos = uint16(bound(pos, 0, 10_000));
        uint256 bits = reg.checkTrade(id, sell(pos, loss, trades, slip));
        assertEq(bits & ~R.SLIPPAGE_OVER, 0);
        assertEq(bits != 0, slip > 50);
    }

    function testFuzz_buy_bits_match_definition(uint16 mp, uint16 ml, uint8 mt, uint16 ms, uint16 pos, uint16 loss, uint8 trades, uint16 slip)
        public
        view
    {
        R.Limits memory l = R.Limits(uint16(bound(mp, 1, 10_000)), uint16(bound(ml, 1, 10_000)), uint8(bound(mt, 1, 96)), uint16(bound(ms, 0, 1_000)), 1 days);
        uint256 bits = reg.checkLimits(l, buy(pos, loss, trades, slip));
        assertEq(bits & R.POSITION_OVER != 0, pos > l.maxPositionBps);
        assertEq(bits & R.DAILY_LOSS_HIT != 0, loss >= l.maxDailyLossBps);
        assertEq(bits & R.TRADES_PER_DAY_HIT != 0, trades >= l.maxTradesPerDay);
        assertEq(bits & R.SLIPPAGE_OVER != 0, slip > l.maxSlippageBps);
        assertEq(bits & R.POSITION_BAD != 0, pos > 10_000);
        assertEq(bits & R.BAD_SIDE, 0);
    }

    function testFuzz_loosening_never_effective_early(uint16 newPos, uint32 waitFor) public {
        uint256 id = registered();
        newPos = uint16(bound(newPos, 5_001, 10_000));
        waitFor = uint32(bound(waitFor, 0, 3 days));
        vm.prank(alice);
        reg.setLimits(id, H2, lim(newPos, 300, 4, 50, 1 days));
        vm.warp(block.timestamp + waitFor);
        uint16 eff = reg.effectiveLimits(id).maxPositionBps;
        if (waitFor < 24 hours) assertEq(eff, 5_000);
        else assertEq(eff, newPos);
    }

    function testFuzz_fold_order_matters(bytes32 a, bytes32 b) public view {
        vm.assume(a != b);
        bytes32[] memory x = new bytes32[](2);
        bytes32[] memory y = new bytes32[](2);
        x[0] = a; x[1] = b; y[0] = b; y[1] = a;
        assertTrue(reg.foldLeaves(x) != reg.foldLeaves(y));
    }
}
