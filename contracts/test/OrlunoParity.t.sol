// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OrlunoLimitRegistry} from "../src/OrlunoLimitRegistry.sol";
import {OrlunoRiskMath as R} from "../src/OrlunoRiskMath.sol";

/// Replays the site's engine (fixtures from scripts/make-parity.ts) against the contract: the same limit bits for 600 cases,
/// and the same decision hashes, fold root and linked head for 400 real backtest decisions over the ETH / USD rounds.
contract OrlunoParityTest is Test {
    struct Case {
        uint16 lp;
        uint16 ll;
        uint8 lt;
        uint16 ls;
        uint32 la;
        uint8 side;
        uint16 pos;
        uint16 loss;
        uint8 trades;
        uint16 slip;
        uint256 bits;
    }

    struct Dec {
        uint64 t;
        uint256 price;
        uint8 action;
        uint256 reasons;
        uint16 pos;
    }

    OrlunoLimitRegistry reg;

    function setUp() public {
        reg = new OrlunoLimitRegistry();
    }

    function test_parity_limit_bits() public view {
        Case[] memory cs = abi.decode(vm.parseBytes(vm.readFile("test/fixtures/parity-limits.hex")), (Case[]));
        assertEq(cs.length, 600);
        for (uint256 i = 0; i < cs.length; i++) {
            Case memory c = cs[i];
            uint256 got = reg.checkLimits(R.Limits(c.lp, c.ll, c.lt, c.ls, c.la), R.Trade(c.side, c.pos, c.loss, c.trades, c.slip));
            assertEq(got, c.bits, string.concat("case ", vm.toString(i)));
        }
    }

    function test_parity_decision_hashes() public view {
        (Dec[] memory ds, bytes32 root, bytes32 head, uint64 fromTs, uint64 toTs, uint32 n, uint32 trades) = abi.decode(
            vm.parseBytes(vm.readFile("test/fixtures/parity-decisions.hex")), (Dec[], bytes32, bytes32, uint64, uint64, uint32, uint32)
        );
        assertEq(ds.length, 400);
        bytes32[] memory leaves = new bytes32[](ds.length);
        for (uint256 i = 0; i < ds.length; i++) {
            leaves[i] = reg.decisionLeaf(ds[i].t, ds[i].price, ds[i].action, ds[i].reasons, ds[i].pos);
        }
        assertEq(reg.foldLeaves(leaves), root);
        assertEq(reg.linkHead(bytes32(0), root, fromTs, toTs, n, trades), head);
    }
}
