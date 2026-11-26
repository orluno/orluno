// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OrlunoLimitRegistry, IOrlunoFeed} from "../src/OrlunoLimitRegistry.sol";
import {OrlunoRiskMath as R} from "../src/OrlunoRiskMath.sol";

/// Runs against a fork of Robinhood Chain mainnet (chain 4663):
///   forge test --match-contract Fork --fork-url http://127.0.0.1:6782 --evm-version cancun
/// (6782 = the DoH relay from ../referensi/start.sh; the Chainlink proxies need cancun opcodes on the fork.)
contract OrlunoForkTest is Test {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant ETH_USD = 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant NVDA_USD = 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15;

    OrlunoLimitRegistry reg;

    function setUp() public {
        if (block.chainid != 4663) return;
        reg = new OrlunoLimitRegistry();
    }

    modifier onFork() {
        if (block.chainid != 4663) {
            emit log("skipped: not a Robinhood Chain fork");
            return;
        }
        _;
    }

    function lim(uint32 age) internal pure returns (R.Limits memory) {
        return R.Limits(5_000, 300, 4, 50, age);
    }

    function test_fork_register_with_real_feeds() public onFork {
        uint256 a = reg.register(keccak256("eth"), WETH, ETH_USD, lim(1 days));
        uint256 b = reg.register(keccak256("nvda"), NVDA, NVDA_USD, lim(7 days));
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(IOrlunoFeed(ETH_USD).decimals(), 8);
    }

    function test_fork_refuses_token_as_feed() public onFork {
        vm.expectRevert(OrlunoLimitRegistry.BadFeed.selector);
        reg.register(keccak256("x"), WETH, NVDA, lim(1 days));
        vm.expectRevert(OrlunoLimitRegistry.BadAsset.selector);
        reg.register(keccak256("x"), address(0xdead), ETH_USD, lim(1 days));
    }

    function test_fork_checkTrade_reads_live_feed_age() public onFork {
        (, int256 answer,, uint256 updatedAt,) = IOrlunoFeed(ETH_USD).latestRoundData();
        assertGt(answer, 0);
        uint256 id = reg.register(keccak256("eth"), WETH, ETH_USD, lim(1 days));
        uint256 age = block.timestamp - updatedAt;
        uint256 bits = reg.checkTrade(id, R.Trade(R.SIDE_BUY, 1_000, 0, 0, 10));
        assertEq(bits, age > 1 days ? reg.PRICE_STALE() : 0);
        // a minute-long limit flags the same live answer as stale once it is over a minute old
        uint256 tight = reg.register(keccak256("eth-tight"), WETH, ETH_USD, R.Limits(5_000, 300, 4, 50, 60));
        vm.warp(updatedAt + 61);
        assertEq(reg.checkTrade(tight, R.Trade(R.SIDE_BUY, 1_000, 0, 0, 10)), reg.PRICE_STALE());
        emit log_named_uint("ETH/USD age at fork block (s)", age);
    }

    function test_fork_gas_profile() public onFork {
        uint256 g = gasleft();
        uint256 id = reg.register(keccak256("eth"), WETH, ETH_USD, lim(1 days));
        emit log_named_uint("register gas", g - gasleft());
        g = gasleft();
        reg.checkTrade(id, R.Trade(R.SIDE_BUY, 1_000, 0, 0, 10));
        emit log_named_uint("checkTrade gas", g - gasleft());
        g = gasleft();
        reg.anchorBatch(id, uint64(block.timestamp - 3600), uint64(block.timestamp), 24, 2, keccak256("root"), bytes32(0));
        emit log_named_uint("anchorBatch gas", g - gasleft());
        g = gasleft();
        reg.setLimits(id, keccak256("eth2"), R.Limits(2_000, 300, 4, 50, 1 days));
        emit log_named_uint("setLimits (tighten) gas", g - gasleft());
    }
}
