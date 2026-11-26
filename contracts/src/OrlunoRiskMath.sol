// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title OrlunoRiskMath
/// @notice Pure rules shared by OrlunoLimitRegistry and the Orluno report engine (src/lib/engine/risk.ts mirrors this file and a
///         parity test replays the engine's cases here). A trade is described by numbers the caller computed off chain:
///         the position after the trade as basis points of equity, today's loss so far in basis points of the day's opening
///         equity, the number of trades already made today (UTC day) and the slippage assumed for the fill.
/// @dev Sells reduce exposure. They are never refused for position size, daily loss or trade count, so a limit can never trap
///      a user in a position. Slippage applies to both sides.
library OrlunoRiskMath {
    uint8 internal constant SIDE_BUY = 1;
    uint8 internal constant SIDE_SELL = 2;

    // Reason bits returned by check() and OrlunoLimitRegistry.checkTrade(). 0 means "within every limit".
    uint256 internal constant BAD_SIDE = 1 << 0; // side is neither buy nor sell
    uint256 internal constant POSITION_OVER = 1 << 1; // a buy would leave the position above maxPositionBps
    uint256 internal constant DAILY_LOSS_HIT = 1 << 2; // today's loss reached maxDailyLossBps: no new buys today
    uint256 internal constant TRADES_PER_DAY_HIT = 1 << 3; // trades already made today reached maxTradesPerDay: no new buys today
    uint256 internal constant SLIPPAGE_OVER = 1 << 4; // assumed slippage above maxSlippageBps
    uint256 internal constant POSITION_BAD = 1 << 5; // positionAfterBps above 10,000 (more than all equity, i.e. leverage)

    uint16 internal constant BPS = 10_000;
    uint8 internal constant MAX_TRADES_CAP = 96;
    uint16 internal constant MAX_SLIPPAGE_CAP = 1_000;
    uint32 internal constant MIN_PRICE_AGE = 60;
    uint32 internal constant MAX_PRICE_AGE = 7 days;

    struct Limits {
        uint16 maxPositionBps; // 1..10,000: largest position as a share of equity
        uint16 maxDailyLossBps; // 1..10,000: loss from the UTC day's opening equity that stops new buys
        uint8 maxTradesPerDay; // 1..96: trades per UTC day after which new buys stop
        uint16 maxSlippageBps; // 0..1,000: largest slippage a fill may assume
        uint32 maxPriceAge; // 60 s..7 days: oldest price feed answer a check accepts
    }

    struct Trade {
        uint8 side; // 1 buy, 2 sell
        uint16 positionAfterBps;
        uint16 dayLossBps;
        uint8 tradesToday;
        uint16 slippageBps;
    }

    function valid(Limits memory l) internal pure returns (bool) {
        return l.maxPositionBps >= 1 && l.maxPositionBps <= BPS && l.maxDailyLossBps >= 1 && l.maxDailyLossBps <= BPS
            && l.maxTradesPerDay >= 1 && l.maxTradesPerDay <= MAX_TRADES_CAP && l.maxSlippageBps <= MAX_SLIPPAGE_CAP
            && l.maxPriceAge >= MIN_PRICE_AGE && l.maxPriceAge <= MAX_PRICE_AGE;
    }

    /// @notice True when `next` allows anything `cur` refuses (any field more permissive). Such a change waits for the delay.
    function loosens(Limits memory cur, Limits memory next) internal pure returns (bool) {
        return next.maxPositionBps > cur.maxPositionBps || next.maxDailyLossBps > cur.maxDailyLossBps
            || next.maxTradesPerDay > cur.maxTradesPerDay || next.maxSlippageBps > cur.maxSlippageBps
            || next.maxPriceAge > cur.maxPriceAge;
    }

    function check(Limits memory l, Trade memory t) internal pure returns (uint256 bits) {
        if (t.side != SIDE_BUY && t.side != SIDE_SELL) bits |= BAD_SIDE;
        if (t.positionAfterBps > BPS) bits |= POSITION_BAD;
        if (t.slippageBps > l.maxSlippageBps) bits |= SLIPPAGE_OVER;
        if (t.side == SIDE_BUY) {
            if (t.positionAfterBps > l.maxPositionBps) bits |= POSITION_OVER;
            if (t.dayLossBps >= l.maxDailyLossBps) bits |= DAILY_LOSS_HIT;
            if (t.tradesToday >= l.maxTradesPerDay) bits |= TRADES_PER_DAY_HIT;
        }
    }

    /// @notice Hash of one paper decision, as the report engine computes it (src/lib/engine/anchor.ts).
    /// @param t bar close time (unix seconds)  @param price feed answer at that close (8 decimals)
    /// @param action 0 wait, 1 hold, 2 buy, 3 sell, 4 refused by a limit  @param reasons rule and limit bits of the decision
    /// @param positionBps position after the decision, basis points of equity
    function leaf(uint64 t, uint256 price, uint8 action, uint256 reasons, uint16 positionBps) internal pure returns (bytes32) {
        return keccak256(abi.encode(t, price, action, reasons, positionBps));
    }

    /// @notice Folds decision hashes in order: root = keccak(root, leaf), starting from zero.
    function fold(bytes32[] memory leaves) internal pure returns (bytes32 root) {
        for (uint256 i = 0; i < leaves.length; i++) {
            root = keccak256(abi.encodePacked(root, leaves[i]));
        }
    }

    /// @notice The registry's running head after a batch: binds the batch root to its window and counts.
    function link(bytes32 head, bytes32 batchRoot, uint64 fromTs, uint64 toTs, uint32 decisions, uint32 trades)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(head, batchRoot, fromTs, toTs, decisions, trades));
    }
}
