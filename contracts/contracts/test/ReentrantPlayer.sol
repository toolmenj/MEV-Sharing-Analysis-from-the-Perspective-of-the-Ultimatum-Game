// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UltimatumGame} from "../UltimatumGame.sol";

/// @dev 測試用：收到款項時嘗試再次提領（重入）。
contract ReentrantPlayer {
    UltimatumGame public immutable game;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    constructor(UltimatumGame _game) {
        game = _game;
    }

    function doCommit(uint256 gameId, bytes32 c) external payable {
        game.commit{value: msg.value}(gameId, c);
    }

    function doReveal(uint256 gameId, uint256 value, bytes32 salt) external {
        game.reveal(gameId, value, salt);
    }

    function doWithdraw() external {
        game.withdraw();
    }

    receive() external payable {
        if (reentryAttempts == 0) {
            reentryAttempts++;
            try game.withdraw() {
                reentrySucceeded = true;
            } catch {}
        }
    }
}
