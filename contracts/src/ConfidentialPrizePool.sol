// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.28;

import {FHE, eaddress, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Confidential no-loss prize pool with fixed, overlapping daily draws.
/// @dev Entry is epoch-aligned while selection and claims remain independently
/// addressable by historical draw ID. Encrypted winner selection never decrypts
/// balances, aggregate weight, randomness, threshold, or winner identity.
contract ConfidentialPrizePool is ZamaEthereumConfig, Ownable, ReentrancyGuard {
    enum DrawStatus {
        Open,
        Selecting,
        Claimable,
        Expired,
        Swept
    }

    struct DrawMetadata {
        uint64 scheduledOpen;
        uint64 scheduledClose;
        uint64 claimableAt;
        uint64 claimExpiresAt;
        uint32 participantCount;
        uint32 scanCursor;
        DrawStatus status;
    }

    uint256 public constant MAX_PARTICIPANTS = 256;
    uint256 public constant MAX_SCAN_BATCH = 12;
    uint256 public constant MAX_ACTIONABLE_QUERY = 32;
    uint64 public constant DRAW_PERIOD = 1 days;
    uint64 public constant CLAIM_PERIOD = 7 days;

    // ERC-7984 balances and amounts are euint64. Dividing custody capacity
    // between principal and prizes guarantees every inbound recipient-balance
    // addition remains <= type(uint64).max as long as all prize sources use the
    // capacity handshake below. Sweeps move already-custodied value and do not
    // increase aggregate prize reserves.
    uint64 public constant MAX_POOL_PRINCIPAL = type(uint64).max / 2;
    uint64 public constant MAX_PRIZE_RESERVES = type(uint64).max - MAX_POOL_PRINCIPAL;

    IERC7984 public immutable asset;
    uint64 public immutable drawEpoch;
    uint64 public currentDrawId;
    address public rewardSource;

    mapping(address account => euint64 principal) private _principal;
    euint64 private _totalPrincipal;
    euint64 private _totalPrizeReserves;

    mapping(uint64 id => DrawMetadata metadata) private _draws;
    mapping(uint64 id => address[] accounts) private _participants;
    mapping(uint64 id => mapping(address account => bool entered)) private _enrolled;
    mapping(uint64 id => mapping(address account => euint64 weight)) private _weights;
    mapping(uint64 id => euint64 totalWeight) private _drawTotalWeight;
    mapping(uint64 id => euint128 threshold) private _drawThreshold;
    mapping(uint64 id => euint64 cumulative) private _drawCumulative;
    mapping(uint64 id => eaddress winner) private _drawWinner;
    mapping(uint64 id => euint64 prize) private _drawPrize;
    mapping(uint64 id => mapping(address account => euint64 amount)) private _prizePreview;
    uint64[] private _actionableDrawIds;
    mapping(uint64 id => uint256 indexPlusOne) private _actionableDrawIndex;

    error DrawNotFound(uint64 drawId);
    error DrawNotOpen(uint64 drawId);
    error DrawNotSelecting(uint64 drawId);
    error DrawNotClaimable(uint64 drawId);
    error DrawStillOpen(uint64 drawId, uint64 closesAt);
    error ClaimExpired(uint64 drawId);
    error DrawNotExpired(uint64 drawId);
    error DrawAlreadySwept(uint64 drawId);
    error ParticipantLimitReached(uint64 drawId);
    error InvalidBatchSize(uint256 supplied);
    error InvalidQuerySize(uint256 supplied);
    error UnauthorizedRewardSource();
    error TimestampOverflow();
    error DrawIdOverflow();

    event DepositRecorded(address indexed account, uint64 indexed drawId);
    event WithdrawalRecorded(address indexed account, uint64 indexed drawId);
    event PrizeFunded(uint64 indexed drawId);
    event RewardSourceSet(address indexed rewardSource);
    event DrawOpened(uint64 indexed drawId, uint64 scheduledOpen, uint64 scheduledClose);
    event DrawFinalized(uint64 indexed drawId, uint32 participantCount);
    event SelectionProgress(uint64 indexed drawId, uint32 cursor, uint32 participantCount);
    event DrawClaimable(uint64 indexed drawId, uint64 claimableAt, uint64 claimExpiresAt);
    event DrawExpired(uint64 indexed drawId);
    event PrizeSwept(uint64 indexed sourceDrawId, uint64 indexed targetDrawId);
    event PrizeClaimAttempted(address indexed account, uint64 indexed drawId);
    event DrawEntered(address indexed account, uint64 indexed drawId);

    constructor(address initialOwner, IERC7984 confidentialAsset) Ownable(initialOwner) {
        asset = confidentialAsset;
        drawEpoch = _asUint64(block.timestamp);
        currentDrawId = 1;

        _totalPrincipal = FHE.asEuint64(0);
        _totalPrizeReserves = FHE.asEuint64(0);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(_totalPrizeReserves);

        _openDraw(1);
    }

    function setRewardSource(address source) external onlyOwner {
        rewardSource = source;
        emit RewardSourceSet(source);
    }

    /// @notice Deposits up to the pool's remaining encrypted principal capacity.
    /// The pool must first be approved as an ERC-7984 operator by the depositor.
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        _synchronizeCurrentDraw();
        uint64 id = currentDrawId;

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 headroom = FHE.sub(FHE.asEuint64(MAX_POOL_PRINCIPAL), _totalPrincipal);
        euint64 accepted = FHE.min(requested, headroom);
        FHE.allowTransient(accepted, address(asset));

        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), accepted);
        _principal[msg.sender] = FHE.add(_principal[msg.sender], transferred);
        _totalPrincipal = FHE.add(_totalPrincipal, transferred);

        FHE.allowThis(_principal[msg.sender]);
        FHE.allow(_principal[msg.sender], msg.sender);
        FHE.allowThis(_totalPrincipal);

        if (_enrolled[id][msg.sender]) {
            _weights[id][msg.sender] = FHE.add(_weights[id][msg.sender], transferred);
            _drawTotalWeight[id] = FHE.add(_drawTotalWeight[id], transferred);
            FHE.allowThis(_weights[id][msg.sender]);
            FHE.allowThis(_drawTotalWeight[id]);
        } else {
            _enterWithPrincipal(id, msg.sender);
        }

        emit DepositRecorded(msg.sender, id);
    }

    /// @notice Enters the current draw using the caller's carried principal.
    function enterDraw() external {
        _synchronizeCurrentDraw();
        _enterWithPrincipal(currentDrawId, msg.sender);
    }

    /// @notice Withdraws principal without depending on any prize lifecycle.
    /// An insufficient request follows the same public path and transfers zero.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        _synchronizeCurrentDraw();
        uint64 id = currentDrawId;

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        ebool enough = FHE.ge(_principal[msg.sender], requested);
        euint64 payout = FHE.select(enough, requested, FHE.asEuint64(0));

        _principal[msg.sender] = FHE.sub(_principal[msg.sender], payout);
        _totalPrincipal = FHE.sub(_totalPrincipal, payout);
        FHE.allowThis(_principal[msg.sender]);
        FHE.allow(_principal[msg.sender], msg.sender);
        FHE.allowThis(_totalPrincipal);

        if (_enrolled[id][msg.sender]) {
            _weights[id][msg.sender] = FHE.sub(_weights[id][msg.sender], payout);
            _drawTotalWeight[id] = FHE.sub(_drawTotalWeight[id], payout);
            FHE.allowThis(_weights[id][msg.sender]);
            FHE.allowThis(_drawTotalWeight[id]);
        }

        FHE.allowTransient(payout, address(asset));
        asset.confidentialTransfer(msg.sender, payout);
        emit WithdrawalRecorded(msg.sender, id);
    }

    /// @notice Supplies owner-funded encrypted yield to the current open draw.
    function fundPrize(externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyOwner nonReentrant {
        _synchronizeCurrentDraw();
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 accepted = FHE.min(requested, _prizeCapacity());
        FHE.allowTransient(accepted, address(asset));

        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), accepted);
        _recordPrize(currentDrawId, transferred);
    }

    /// @notice Returns encrypted capacity to the configured reward source for
    /// clamping before it transfers tokens to this contract.
    function preparePrizeCapacity() external returns (euint64 capacity) {
        if (msg.sender != rewardSource) revert UnauthorizedRewardSource();
        _synchronizeCurrentDraw();
        capacity = _prizeCapacity();
        FHE.allowTransient(capacity, msg.sender);
    }

    /// @notice Accounts for a capacity-clamped transfer made by the reward source.
    /// @dev The configured source is trusted to call `preparePrizeCapacity`, take
    /// `min(payout, capacity)`, transfer only that value, then pass the token's
    /// actual `transferred` handle here in the same transaction.
    function receivePrizeFromSource(euint64 encryptedAmount) external nonReentrant {
        if (msg.sender != rewardSource) revert UnauthorizedRewardSource();
        _synchronizeCurrentDraw();
        _recordPrize(currentDrawId, encryptedAmount);
    }

    /// @notice Finalizes the expired entry draw and opens the currently aligned period.
    function closeDraw() external {
        uint64 id = currentDrawId;
        DrawMetadata storage metadata = _draws[id];
        if (metadata.status != DrawStatus.Open) revert DrawNotOpen(id);
        if (block.timestamp < metadata.scheduledClose) revert DrawStillOpen(id, metadata.scheduledClose);
        _finalizeAndOpenAligned(id);
    }

    /// @notice Advances one historical encrypted weighted scan in a bounded batch.
    function continueSelection(uint64 id, uint256 maxAccounts) external {
        DrawMetadata storage metadata = _requireDraw(id);
        if (metadata.status != DrawStatus.Selecting) revert DrawNotSelecting(id);
        if (maxAccounts == 0 || maxAccounts > MAX_SCAN_BATCH) revert InvalidBatchSize(maxAccounts);

        uint256 cursor = metadata.scanCursor;
        uint256 count = metadata.participantCount;
        uint256 remaining = count - cursor;
        uint256 step = maxAccounts < remaining ? maxAccounts : remaining;
        uint256 end = cursor + step;

        for (uint256 i = cursor; i < end; ++i) {
            _scanAccount(id, _participants[id][i]);
        }

        FHE.allowThis(_drawCumulative[id]);
        FHE.allowThis(_drawWinner[id]);
        metadata.scanCursor = uint32(end);

        if (end == count) {
            _makeClaimable(id, metadata);
        } else {
            emit SelectionProgress(id, uint32(end), metadata.participantCount);
        }
    }

    /// @notice Creates a caller-decryptable historical prize-or-zero preview.
    function previewPrize(uint64 id) external {
        _requireClaimable(id);
        ebool isWinner = FHE.eq(_drawWinner[id], msg.sender);
        euint64 preview = FHE.select(isWinner, _drawPrize[id], FHE.asEuint64(0));
        _prizePreview[id][msg.sender] = preview;
        FHE.allowThis(preview);
        FHE.allow(preview, msg.sender);
    }

    /// @notice Transfers encrypted prize-or-zero for an explicit historical draw.
    /// Winner, non-winner, and repeat claims share the same public path.
    function claimPrize(uint64 id) external nonReentrant {
        _requireClaimable(id);
        ebool isWinner = FHE.eq(_drawWinner[id], msg.sender);
        euint64 payout = FHE.select(isWinner, _drawPrize[id], FHE.asEuint64(0));
        _drawPrize[id] = FHE.select(isWinner, FHE.asEuint64(0), _drawPrize[id]);
        _totalPrizeReserves = FHE.sub(_totalPrizeReserves, payout);

        FHE.allowThis(_drawPrize[id]);
        FHE.allowThis(_totalPrizeReserves);
        FHE.allowTransient(payout, address(asset));
        asset.confidentialTransfer(msg.sender, payout);
        emit PrizeClaimAttempted(msg.sender, id);
    }

    /// @notice Persists the permissionless Claimable -> Expired transition.
    function expireDraw(uint64 id) external {
        _expireDraw(id);
    }

    /// @notice Moves an expired draw's encrypted remainder to the current open draw.
    function sweepExpiredPrize(uint64 id) external {
        _synchronizeCurrentDraw();
        DrawMetadata storage source = _requireDraw(id);
        if (source.status == DrawStatus.Swept) revert DrawAlreadySwept(id);
        if (source.status == DrawStatus.Claimable) _expireDraw(id);
        if (source.status != DrawStatus.Expired) revert DrawNotExpired(id);

        uint64 targetId = currentDrawId;
        euint64 remainingPrize = _drawPrize[id];
        _drawPrize[id] = FHE.asEuint64(0);
        _drawPrize[targetId] = FHE.add(_drawPrize[targetId], remainingPrize);
        FHE.allowThis(_drawPrize[id]);
        FHE.allowThis(_drawPrize[targetId]);

        source.status = DrawStatus.Swept;
        _removeActionableDraw(id);
        emit PrizeSwept(id, targetId);
    }

    function drawMetadata(uint64 id) public view returns (DrawMetadata memory metadata) {
        metadata = _draws[id];
        if (
            metadata.status == DrawStatus.Claimable && metadata.claimExpiresAt != 0
                && block.timestamp >= metadata.claimExpiresAt
        ) {
            metadata.status = DrawStatus.Expired;
        }
    }

    function currentDrawMetadata() external view returns (DrawMetadata memory) {
        return drawMetadata(currentDrawId);
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function prizePreviewOf(uint64 id, address account) external view returns (euint64) {
        return _prizePreview[id][account];
    }

    function participantCount() external view returns (uint256) {
        return _draws[currentDrawId].participantCount;
    }

    function isEnteredCurrent(address account) external view returns (bool) {
        return _enrolled[currentDrawId][account];
    }

    function isEntered(uint64 id, address account) external view returns (bool) {
        return _enrolled[id][account];
    }

    function actionableDrawCount() external view returns (uint256) {
        return _actionableDrawIds.length;
    }

    /// @notice Returns a bounded page of every finalized, unswept draw ID.
    function actionableDrawIds(uint256 offset, uint256 limit) external view returns (uint64[] memory ids) {
        if (limit == 0 || limit > MAX_ACTIONABLE_QUERY) revert InvalidQuerySize(limit);
        uint256 count = _actionableDrawIds.length;
        if (offset >= count) return new uint64[](0);
        uint256 remaining = count - offset;
        uint256 size = limit < remaining ? limit : remaining;
        ids = new uint64[](size);
        for (uint256 i = 0; i < size; ++i) ids[i] = _actionableDrawIds[offset + i];
    }

    function _synchronizeCurrentDraw() private {
        uint64 id = currentDrawId;
        DrawMetadata storage metadata = _draws[id];
        if (metadata.status != DrawStatus.Open) revert DrawNotOpen(id);
        if (block.timestamp >= metadata.scheduledClose) _finalizeAndOpenAligned(id);
    }

    function _finalizeAndOpenAligned(uint64 id) private {
        DrawMetadata storage metadata = _draws[id];
        metadata.status = DrawStatus.Selecting;
        metadata.scanCursor = 0;

        uint32 count = metadata.participantCount;
        _trackActionableDraw(id);
        emit DrawFinalized(id, count);

        if (count == 0) {
            _drawWinner[id] = FHE.asEaddress(address(0));
            FHE.allowThis(_drawWinner[id]);
            _makeClaimable(id, metadata);
        } else {
            _drawThreshold[id] = FHE.mul(FHE.asEuint128(_drawTotalWeight[id]), FHE.randEuint64());
            _drawCumulative[id] = FHE.asEuint64(0);
            _drawWinner[id] = FHE.asEaddress(address(0));
            FHE.allowThis(_drawThreshold[id]);
            FHE.allowThis(_drawCumulative[id]);
            FHE.allowThis(_drawWinner[id]);
        }

        uint64 alignedId = _drawIdAt(block.timestamp);
        if (alignedId <= id) revert DrawIdOverflow();
        currentDrawId = alignedId;
        _openDraw(alignedId);
    }

    function _openDraw(uint64 id) private {
        DrawMetadata storage metadata = _draws[id];
        uint64 scheduledOpen = _scheduledOpen(id);
        uint64 scheduledClose = _scheduledClose(id);
        metadata.scheduledOpen = scheduledOpen;
        metadata.scheduledClose = scheduledClose;
        metadata.status = DrawStatus.Open;

        _drawTotalWeight[id] = FHE.asEuint64(0);
        _drawPrize[id] = FHE.asEuint64(0);
        FHE.allowThis(_drawTotalWeight[id]);
        FHE.allowThis(_drawPrize[id]);
        emit DrawOpened(id, scheduledOpen, scheduledClose);
    }

    function _enterWithPrincipal(uint64 id, address account) private {
        if (_enrolled[id][account]) return;
        DrawMetadata storage metadata = _draws[id];
        if (metadata.status != DrawStatus.Open) revert DrawNotOpen(id);
        if (metadata.participantCount >= MAX_PARTICIPANTS) revert ParticipantLimitReached(id);

        euint64 weight = FHE.add(_principal[account], FHE.asEuint64(0));
        _weights[id][account] = weight;
        _drawTotalWeight[id] = FHE.add(_drawTotalWeight[id], weight);
        FHE.allowThis(_weights[id][account]);
        FHE.allowThis(_drawTotalWeight[id]);

        _enrolled[id][account] = true;
        _participants[id].push(account);
        metadata.participantCount += 1;
        emit DrawEntered(account, id);
    }

    function _recordPrize(uint64 id, euint64 transferred) private {
        _drawPrize[id] = FHE.add(_drawPrize[id], transferred);
        _totalPrizeReserves = FHE.add(_totalPrizeReserves, transferred);
        FHE.allowThis(_drawPrize[id]);
        FHE.allowThis(_totalPrizeReserves);
        emit PrizeFunded(id);
    }

    function _trackActionableDraw(uint64 id) private {
        if (_actionableDrawIndex[id] != 0) return;
        _actionableDrawIds.push(id);
        _actionableDrawIndex[id] = _actionableDrawIds.length;
    }

    function _removeActionableDraw(uint64 id) private {
        uint256 indexPlusOne = _actionableDrawIndex[id];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _actionableDrawIds.length - 1;
        if (index != lastIndex) {
            uint64 movedId = _actionableDrawIds[lastIndex];
            _actionableDrawIds[index] = movedId;
            _actionableDrawIndex[movedId] = index + 1;
        }
        _actionableDrawIds.pop();
        delete _actionableDrawIndex[id];
    }

    function _scanAccount(uint64 id, address account) private {
        _drawCumulative[id] = FHE.add(_drawCumulative[id], _weights[id][account]);
        euint128 scaledCumulative = FHE.shl(FHE.asEuint128(_drawCumulative[id]), 64);
        ebool ticketReached = FHE.gt(scaledCumulative, _drawThreshold[id]);
        ebool winnerUnset = FHE.eq(_drawWinner[id], address(0));
        ebool selectAccount = FHE.and(ticketReached, winnerUnset);
        _drawWinner[id] = FHE.select(selectAccount, FHE.asEaddress(account), _drawWinner[id]);
    }

    function _prizeCapacity() private returns (euint64) {
        return FHE.sub(FHE.asEuint64(MAX_PRIZE_RESERVES), _totalPrizeReserves);
    }

    function _makeClaimable(uint64 id, DrawMetadata storage metadata) private {
        uint64 claimableAt = _asUint64(block.timestamp);
        uint64 claimExpiresAt = _addTimestamp(claimableAt, CLAIM_PERIOD);
        metadata.claimableAt = claimableAt;
        metadata.claimExpiresAt = claimExpiresAt;
        metadata.status = DrawStatus.Claimable;
        emit DrawClaimable(id, claimableAt, claimExpiresAt);
    }

    function _expireDraw(uint64 id) private {
        DrawMetadata storage metadata = _requireDraw(id);
        if (metadata.status == DrawStatus.Swept) revert DrawAlreadySwept(id);
        if (metadata.status == DrawStatus.Expired) return;
        if (metadata.status != DrawStatus.Claimable || block.timestamp < metadata.claimExpiresAt) {
            revert DrawNotExpired(id);
        }
        metadata.status = DrawStatus.Expired;
        emit DrawExpired(id);
    }

    function _requireClaimable(uint64 id) private view returns (DrawMetadata storage metadata) {
        metadata = _requireDraw(id);
        if (metadata.status != DrawStatus.Claimable) revert DrawNotClaimable(id);
        if (block.timestamp >= metadata.claimExpiresAt) revert ClaimExpired(id);
    }

    function _requireDraw(uint64 id) private view returns (DrawMetadata storage metadata) {
        metadata = _draws[id];
        if (metadata.scheduledOpen == 0) revert DrawNotFound(id);
    }

    function _drawIdAt(uint256 timestamp) private view returns (uint64) {
        uint256 id = ((timestamp - uint256(drawEpoch)) / uint256(DRAW_PERIOD)) + 1;
        if (id > type(uint64).max) revert DrawIdOverflow();
        return uint64(id);
    }

    function _scheduledOpen(uint64 id) private view returns (uint64) {
        if (id == 0) revert DrawIdOverflow();
        uint256 timestamp = uint256(drawEpoch) + (uint256(id) - 1) * uint256(DRAW_PERIOD);
        return _asUint64(timestamp);
    }

    function _scheduledClose(uint64 id) private view returns (uint64) {
        return _addTimestamp(_scheduledOpen(id), DRAW_PERIOD);
    }

    function _addTimestamp(uint64 timestamp, uint64 delta) private pure returns (uint64) {
        return _asUint64(uint256(timestamp) + uint256(delta));
    }

    function _asUint64(uint256 value) private pure returns (uint64) {
        if (value > type(uint64).max) revert TimestampOverflow();
        return uint64(value);
    }
}
