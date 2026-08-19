// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.28;

import {FHE, eaddress, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Confidential no-loss prize pool for an ERC-7984 asset.
/// @dev The production deployment should put yield routing behind a separately
/// audited adapter. This contract owns the confidential accounting and draw.
contract ConfidentialPrizePool is ZamaEthereumConfig, Ownable, ReentrancyGuard {
    enum DrawPhase {
        Open,
        Selecting,
        Claimable
    }

    uint256 public constant MAX_PARTICIPANTS = 256;
    uint256 public constant MAX_SCAN_BATCH = 12;
    uint64 public constant DRAW_PERIOD = 7 days;
    uint64 public constant CLAIM_PERIOD = 7 days;

    IERC7984 public immutable asset;
    DrawPhase public phase;
    uint64 public drawId;
    uint64 public drawClosesAt;
    uint256 public scanCursor;

    mapping(address account => euint64 principal) private _principal;
    mapping(uint64 id => mapping(address account => euint64 weight)) private _snapshotWeight;
    mapping(uint64 id => mapping(address account => euint64 amount)) private _prizePreview;
    mapping(uint64 id => euint64 amount) private _drawPrize;
    mapping(uint64 id => eaddress winner) private _drawWinner;
    mapping(uint64 id => uint64 closesAt) public drawClaimClosesAt;
    mapping(uint64 id => bool ready) public drawClaimable;
    mapping(address account => bool joined) private _joined;
    address[] private _participants;

    euint64 private _totalPrincipal;
    euint64 private _snapshotTotalEncrypted;
    euint128 private _winningThreshold;
    euint64 private _scanCumulative;
    eaddress private _winner;

    error DrawNotOpen();
    error DrawNotSelecting();
    error DrawNotClaimable();
    error DrawStillOpen(uint64 closesAt);
    error DrawClaimWindowClosed(uint64 closesAt);
    error EmptyPool();
    error ParticipantLimitReached();
    error InvalidBatchSize();

    event DepositRecorded(address indexed account, uint64 indexed drawId);
    event WithdrawalRecorded(address indexed account, uint64 indexed drawId);
    event PrizeFunded(uint64 indexed drawId);
    event DrawOpened(uint64 indexed drawId, uint64 closesAt);
    event DrawSelectionStarted(uint64 indexed drawId, uint256 participantCount);
    event DrawSelectionProgress(uint64 indexed drawId, uint256 cursor, uint256 participantCount);
    event DrawClaimable(uint64 indexed drawId, uint64 claimClosesAt);
    event PrizeRolledOver(uint64 indexed fromDrawId, uint64 indexed toDrawId);
    event PrizeClaimAttempted(address indexed account, uint64 indexed drawId);

    constructor(address initialOwner, IERC7984 confidentialAsset) Ownable(initialOwner) {
        asset = confidentialAsset;
        drawId = 1;
        phase = DrawPhase.Open;
        drawClosesAt = uint64(block.timestamp + DRAW_PERIOD);
        emit DrawOpened(drawId, drawClosesAt);
    }

    /// @notice Deposits confidential cUSDT. The pool must first be approved as
    /// an ERC-7984 operator by the depositor.
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        if (phase != DrawPhase.Open) revert DrawNotOpen();
        if (!_joined[msg.sender]) {
            if (_participants.length == MAX_PARTICIPANTS) revert ParticipantLimitReached();
            _joined[msg.sender] = true;
            _participants.push(msg.sender);
        }

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);
        FHE.allowTransient(requested, address(asset));

        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), requested);
        _principal[msg.sender] = FHE.add(_principal[msg.sender], transferred);
        _totalPrincipal = FHE.add(_totalPrincipal, transferred);

        FHE.allowThis(_principal[msg.sender]);
        FHE.allow(_principal[msg.sender], msg.sender);
        FHE.allowThis(_totalPrincipal);

        emit DepositRecorded(msg.sender, drawId);
    }

    /// @notice Withdraws principal at any point in the draw lifecycle. An
    /// insufficient request transfers encrypted zero and does not reveal why.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        ebool enough = FHE.ge(_principal[msg.sender], requested);
        euint64 payout = FHE.select(enough, requested, FHE.asEuint64(0));

        _principal[msg.sender] = FHE.sub(_principal[msg.sender], payout);
        _totalPrincipal = FHE.sub(_totalPrincipal, payout);

        FHE.allowThis(_principal[msg.sender]);
        FHE.allow(_principal[msg.sender], msg.sender);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(payout);
        FHE.allowTransient(payout, address(asset));

        asset.confidentialTransfer(msg.sender, payout);
        emit WithdrawalRecorded(msg.sender, drawId);
    }

    /// @notice Supplies encrypted yield for the current prize reserve.
    function fundPrize(externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyOwner nonReentrant {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);
        FHE.allowTransient(requested, address(asset));

        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), requested);
        _drawPrize[drawId] = FHE.add(_drawPrize[drawId], transferred);
        FHE.allowThis(_drawPrize[drawId]);

        emit PrizeFunded(drawId);
    }

    /// @notice Freezes weight handles and derives a weighted random threshold
    /// without publicly decrypting the aggregate or any individual position.
    function closeDraw() external onlyOwner {
        if (phase != DrawPhase.Open) revert DrawNotOpen();
        if (block.timestamp < drawClosesAt) revert DrawStillOpen(drawClosesAt);
        if (_participants.length == 0) revert EmptyPool();

        uint256 length = _participants.length;
        for (uint256 i = 0; i < length; ++i) {
            address account = _participants[i];
            _snapshotWeight[drawId][account] = _principal[account];
        }

        _snapshotTotalEncrypted = _totalPrincipal;
        _winningThreshold = FHE.mul(FHE.asEuint128(_snapshotTotalEncrypted), FHE.randEuint64());
        _scanCumulative = FHE.asEuint64(0);
        _winner = FHE.asEaddress(address(0));
        scanCursor = 0;

        FHE.allowThis(_snapshotTotalEncrypted);
        FHE.allowThis(_winningThreshold);
        FHE.allowThis(_scanCumulative);
        FHE.allowThis(_winner);
        phase = DrawPhase.Selecting;

        emit DrawSelectionStarted(drawId, length);
    }

    /// @notice Advances the encrypted weighted scan in bounded HCU batches.
    function continueSelection(uint256 maxAccounts) external {
        if (phase != DrawPhase.Selecting) revert DrawNotSelecting();
        if (maxAccounts == 0 || maxAccounts > MAX_SCAN_BATCH) revert InvalidBatchSize();

        uint256 length = _participants.length;
        uint256 end = scanCursor + maxAccounts;
        if (end > length) end = length;

        for (uint256 i = scanCursor; i < end; ++i) {
            address account = _participants[i];
            _scanCumulative = FHE.add(_scanCumulative, _snapshotWeight[drawId][account]);
            euint128 scaledCumulative = FHE.shl(FHE.asEuint128(_scanCumulative), 64);
            ebool ticketReached = FHE.gt(scaledCumulative, _winningThreshold);
            ebool winnerUnset = FHE.eq(_winner, address(0));
            ebool selectAccount = FHE.and(ticketReached, winnerUnset);
            _winner = FHE.select(selectAccount, FHE.asEaddress(account), _winner);
        }

        FHE.allowThis(_scanCumulative);
        FHE.allowThis(_winner);
        scanCursor = end;

        if (end == length) {
            _drawWinner[drawId] = _winner;
            FHE.allowThis(_drawWinner[drawId]);
            drawClaimable[drawId] = true;
            drawClaimClosesAt[drawId] = uint64(block.timestamp + CLAIM_PERIOD);
            phase = DrawPhase.Claimable;
            emit DrawClaimable(drawId, drawClaimClosesAt[drawId]);
        } else {
            emit DrawSelectionProgress(drawId, end, length);
        }
    }

    /// @notice Creates a user-decryptable prize-or-zero preview. Calling this
    /// does not reveal the winner to the chain or to other users.
    function previewPrize(uint64 id) external {
        if (!drawClaimable[id]) revert DrawNotClaimable();
        uint64 closesAt = drawClaimClosesAt[id];
        if (block.timestamp >= closesAt) revert DrawClaimWindowClosed(closesAt);
        ebool isWinner = FHE.eq(_drawWinner[id], msg.sender);
        euint64 preview = FHE.select(isWinner, _drawPrize[id], FHE.asEuint64(0));
        _prizePreview[id][msg.sender] = preview;
        FHE.allowThis(preview);
        FHE.allow(preview, msg.sender);
    }

    /// @notice Transfers prize-or-zero. Non-winners and repeat claims follow
    /// the same public path, preventing a conditional revert leak.
    function claimPrize(uint64 id) external nonReentrant {
        if (!drawClaimable[id]) revert DrawNotClaimable();
        uint64 closesAt = drawClaimClosesAt[id];
        if (block.timestamp >= closesAt) revert DrawClaimWindowClosed(closesAt);

        ebool isWinner = FHE.eq(_drawWinner[id], msg.sender);
        euint64 payout = FHE.select(isWinner, _drawPrize[id], FHE.asEuint64(0));
        _drawPrize[id] = FHE.select(isWinner, FHE.asEuint64(0), _drawPrize[id]);

        FHE.allowThis(_drawPrize[id]);
        FHE.allowThis(payout);
        FHE.allowTransient(payout, address(asset));
        asset.confidentialTransfer(msg.sender, payout);

        emit PrizeClaimAttempted(msg.sender, id);
    }

    function openNextDraw() external onlyOwner {
        if (phase != DrawPhase.Claimable) revert DrawNotClaimable();
        uint64 previousDrawId = drawId;
        uint64 closesAt = drawClaimClosesAt[previousDrawId];
        if (block.timestamp < closesAt) revert DrawStillOpen(closesAt);

        euint64 remainingPrize = _drawPrize[previousDrawId];
        _drawPrize[previousDrawId] = FHE.asEuint64(0);
        FHE.allowThis(_drawPrize[previousDrawId]);
        drawClaimable[previousDrawId] = false;

        unchecked {
            ++drawId;
        }
        _drawPrize[drawId] = remainingPrize;
        FHE.allowThis(_drawPrize[drawId]);
        scanCursor = 0;
        phase = DrawPhase.Open;
        drawClosesAt = uint64(block.timestamp + DRAW_PERIOD);
        emit PrizeRolledOver(previousDrawId, drawId);
        emit DrawOpened(drawId, drawClosesAt);
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function prizePreviewOf(uint64 id, address account) external view returns (euint64) {
        return _prizePreview[id][account];
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }
}
