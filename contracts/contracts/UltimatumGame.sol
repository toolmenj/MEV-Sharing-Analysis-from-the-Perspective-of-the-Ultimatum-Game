// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title 以 commit-reveal 實作的最後通牒賽局（strategy method）
/// @notice
///  - 實驗者（funder）出資獎金池 pot，並指定提議者與回應者。
///  - 提議者承諾 offer（要分給回應者多少），回應者承諾 threshold（最低可接受金額）。
///  - 兩邊都承諾後才進入揭露期，因此沒有人能在看到對方選擇後才決定自己的選擇。
///  - 揭露後自動結算：offer >= threshold 視為接受，雙方得到 (pot - offer, offer)；
///    否則視為拒絕，雙方都得 0，pot 退回實驗者。
///  - 雙方各押 deposit；逾期不揭露者押金被沒收，轉給有揭露的一方。
///  - 一律用「先記帳、再自行提領」(pull payment)，避免重入與卡款。
contract UltimatumGame {
    enum Phase {
        None, // 不存在
        Commit, // 等待雙方承諾
        Reveal, // 雙方都已承諾，等待揭露
        Settled, // 已結算（接受或拒絕）
        Cancelled, // 承諾期逾期，取消
        Defaulted // 揭露期逾期，有人沒揭露
    }

    struct Game {
        address funder;
        address proposer;
        address responder;
        uint256 pot;
        uint256 deposit;
        uint64 commitDeadline;
        uint64 revealPeriod;
        uint64 revealDeadline;
        Phase phase;
        bytes32 offerCommit;
        bytes32 thresholdCommit;
        bool offerRevealed;
        bool thresholdRevealed;
        uint256 offer;
        uint256 threshold;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) public games;
    mapping(address => uint256) public balances;

    event GameCreated(
        uint256 indexed gameId,
        address indexed funder,
        address indexed proposer,
        address responder,
        uint256 pot,
        uint256 deposit,
        uint64 commitDeadline,
        uint64 revealPeriod
    );
    event Committed(uint256 indexed gameId, address indexed player, bytes32 commitment);
    event RevealPhaseStarted(uint256 indexed gameId, uint64 revealDeadline);
    event Revealed(uint256 indexed gameId, address indexed player, uint256 value);
    event Settled(uint256 indexed gameId, uint256 offer, uint256 threshold, bool accepted);
    event Cancelled(uint256 indexed gameId);
    event Defaulted(uint256 indexed gameId, bool proposerRevealed, bool responderRevealed);
    event Withdrawn(address indexed account, uint256 amount);

    error WrongPhase();
    error NotPlayer();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error WrongDeposit();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error BadReveal();
    error ValueOutOfRange();
    error BadParams();
    error NothingToWithdraw();
    error TransferFailed();

    /// @notice 承諾值的算法。綁定合約位址、鏈、局號與玩家位址，
    ///         所以承諾無法被對手照抄，也無法拿到別局或別條鏈重放。
    function commitmentOf(
        uint256 gameId,
        address player,
        uint256 value,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, gameId, player, value, salt));
    }

    /// @notice 實驗者開一局，msg.value 即為獎金池 pot。
    function createGame(
        address proposer,
        address responder,
        uint256 deposit,
        uint64 commitPeriod,
        uint64 revealPeriod
    ) external payable returns (uint256 gameId) {
        if (
            msg.value == 0 ||
            proposer == address(0) ||
            responder == address(0) ||
            proposer == responder ||
            deposit == 0 ||
            commitPeriod == 0 ||
            revealPeriod == 0
        ) revert BadParams();

        gameId = ++gameCount;
        Game storage g = games[gameId];
        g.funder = msg.sender;
        g.proposer = proposer;
        g.responder = responder;
        g.pot = msg.value;
        g.deposit = deposit;
        g.commitDeadline = uint64(block.timestamp) + commitPeriod;
        g.revealPeriod = revealPeriod;
        g.phase = Phase.Commit;

        emit GameCreated(
            gameId,
            msg.sender,
            proposer,
            responder,
            msg.value,
            deposit,
            g.commitDeadline,
            revealPeriod
        );
    }

    /// @notice 玩家送出承諾並付押金。提議者承諾 offer，回應者承諾 threshold。
    function commit(uint256 gameId, bytes32 commitment) external payable {
        Game storage g = games[gameId];
        if (g.phase != Phase.Commit) revert WrongPhase();
        if (block.timestamp > g.commitDeadline) revert DeadlinePassed();
        if (msg.value != g.deposit) revert WrongDeposit();
        if (commitment == bytes32(0)) revert BadParams();

        if (msg.sender == g.proposer) {
            if (g.offerCommit != bytes32(0)) revert AlreadyCommitted();
            g.offerCommit = commitment;
        } else if (msg.sender == g.responder) {
            if (g.thresholdCommit != bytes32(0)) revert AlreadyCommitted();
            g.thresholdCommit = commitment;
        } else {
            revert NotPlayer();
        }
        emit Committed(gameId, msg.sender, commitment);

        if (g.offerCommit != bytes32(0) && g.thresholdCommit != bytes32(0)) {
            g.phase = Phase.Reveal;
            g.revealDeadline = uint64(block.timestamp) + g.revealPeriod;
            emit RevealPhaseStarted(gameId, g.revealDeadline);
        }
    }

    /// @notice 揭露。value 必須落在 [0, pot]；第二個人揭露時自動結算。
    function reveal(uint256 gameId, uint256 value, bytes32 salt) external {
        Game storage g = games[gameId];
        if (g.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp > g.revealDeadline) revert DeadlinePassed();
        if (value > g.pot) revert ValueOutOfRange();

        bytes32 c = commitmentOf(gameId, msg.sender, value, salt);
        if (msg.sender == g.proposer) {
            if (g.offerRevealed) revert AlreadyRevealed();
            if (c != g.offerCommit) revert BadReveal();
            g.offerRevealed = true;
            g.offer = value;
        } else if (msg.sender == g.responder) {
            if (g.thresholdRevealed) revert AlreadyRevealed();
            if (c != g.thresholdCommit) revert BadReveal();
            g.thresholdRevealed = true;
            g.threshold = value;
        } else {
            revert NotPlayer();
        }
        emit Revealed(gameId, msg.sender, value);

        if (g.offerRevealed && g.thresholdRevealed) {
            _settle(gameId, g);
        }
    }

    function _settle(uint256 gameId, Game storage g) private {
        g.phase = Phase.Settled;
        bool accepted = g.offer >= g.threshold;
        if (accepted) {
            balances[g.proposer] += g.pot - g.offer + g.deposit;
            balances[g.responder] += g.offer + g.deposit;
        } else {
            balances[g.proposer] += g.deposit;
            balances[g.responder] += g.deposit;
            balances[g.funder] += g.pot;
        }
        emit Settled(gameId, g.offer, g.threshold, accepted);
    }

    /// @notice 承諾期過了仍未湊齊兩個承諾：取消，退回 pot 與已付的押金。任何人都可呼叫。
    function cancel(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.phase != Phase.Commit) revert WrongPhase();
        if (block.timestamp <= g.commitDeadline) revert DeadlineNotPassed();
        g.phase = Phase.Cancelled;
        balances[g.funder] += g.pot;
        if (g.offerCommit != bytes32(0)) balances[g.proposer] += g.deposit;
        if (g.thresholdCommit != bytes32(0)) balances[g.responder] += g.deposit;
        emit Cancelled(gameId);
    }

    /// @notice 揭露期過了仍有人未揭露：沒揭露的人押金被沒收。任何人都可呼叫。
    ///  - 只有一方沒揭露：他的押金給有揭露的一方；pot 退回實驗者。
    ///  - 雙方都沒揭露：兩份押金都給實驗者；pot 退回實驗者。
    function claimTimeout(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.phase != Phase.Reveal) revert WrongPhase();
        if (block.timestamp <= g.revealDeadline) revert DeadlineNotPassed();
        g.phase = Phase.Defaulted;
        balances[g.funder] += g.pot;
        if (g.offerRevealed) {
            balances[g.proposer] += 2 * g.deposit;
        } else if (g.thresholdRevealed) {
            balances[g.responder] += 2 * g.deposit;
        } else {
            balances[g.funder] += 2 * g.deposit;
        }
        emit Defaulted(gameId, g.offerRevealed, g.thresholdRevealed);
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
