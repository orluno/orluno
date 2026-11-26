// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice A settable Chainlink-style feed for tests.
contract OrlunoMockFeed {
    int256 public answer = 300_000_000_000; // 3,000.00000000
    uint256 public updatedAt;
    uint8 public decimals = 8;
    bool public broken;

    constructor() {
        updatedAt = block.timestamp;
    }

    function set(int256 a, uint256 u) external {
        answer = a;
        updatedAt = u;
    }

    function setDecimals(uint8 d) external {
        decimals = d;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!broken, "broken");
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// @notice Anything with code stands in for an asset.
contract OrlunoMockAsset {
    function symbol() external pure returns (string memory) {
        return "TEST";
    }
}
