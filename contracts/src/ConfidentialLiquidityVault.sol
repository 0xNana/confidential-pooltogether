// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.28;

import {FHE, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IConfidentialPrizeReceiver {
    function preparePrizeCapacity() external returns (euint64);

    function receivePrizeFromSource(euint64 encryptedAmount) external;
}

/// @notice Confidential cUSDT vault for the Liquidity Hunt launch.
/// @dev The reward reserve is a testnet APY source. It does not deploy
/// principal into an external yield strategy.
contract ConfidentialLiquidityVault is ZamaEthereumConfig, Ownable, ReentrancyGuard {
    uint64 public constant MATURITY_PERIOD = 90 days;
    uint64 public constant REWARD_FUNDING_COOLDOWN = 1 days;
    uint64 public constant REWARD_ACCRUAL_PERIOD = 365 days;
    uint64 public constant TARGET_APY_BPS = 1200;

    IERC7984 public immutable asset;
    mapping(address account => euint64 principal) private _principal;
    mapping(address account => uint64 maturityAt) public maturityOf;
    euint64 private _totalPrincipal;
    euint64 private _rewardReserve;
    euint128 private _accruedReward;
    uint64 public lastAccruedAt;
    uint64 public lastRewardFundedAt;

    error ZeroAddress();
    error RewardFundingCooldown(uint64 readyAt);

    event Deposited(address indexed account, uint64 maturityAt);
    event Withdrawn(address indexed account);
    event RewardsFunded();
    event PrizePoolFunded(address indexed prizePool);

    constructor(address initialOwner, IERC7984 confidentialAsset) Ownable(initialOwner) {
        if (address(confidentialAsset) == address(0)) revert ZeroAddress();
        asset = confidentialAsset;
        _accruedReward = FHE.asEuint128(0);
        lastAccruedAt = uint64(block.timestamp);
        FHE.allowThis(_accruedReward);
        FHE.allow(_accruedReward, initialOwner);
    }

    /// @notice Deposits confidential cUSDT. The vault must be an ERC-7984 operator.
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);
        FHE.allowTransient(requested, address(asset));

        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), requested);
        _accrueRewards();
        _principal[msg.sender] = FHE.add(_principal[msg.sender], transferred);
        _totalPrincipal = FHE.add(_totalPrincipal, transferred);
        if (maturityOf[msg.sender] == 0) {
            maturityOf[msg.sender] = uint64(block.timestamp + MATURITY_PERIOD);
        }

        FHE.allowThis(_principal[msg.sender]);
        FHE.allow(_principal[msg.sender], msg.sender);
        FHE.allowThis(_totalPrincipal);
        FHE.allow(_totalPrincipal, msg.sender);
        emit Deposited(msg.sender, maturityOf[msg.sender]);
    }

    /// @notice Withdraws principal at any time. Rewards are funded separately from saver principal.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 payout = FHE.select(FHE.ge(_principal[msg.sender], requested), requested, FHE.asEuint64(0));

        _accrueRewards();
        _principal[msg.sender] = FHE.sub(_principal[msg.sender], payout);
        _totalPrincipal = FHE.sub(_totalPrincipal, payout);
        FHE.allowThis(_principal[msg.sender]);
        FHE.allow(_principal[msg.sender], msg.sender);
        FHE.allowThis(_totalPrincipal);
        FHE.allow(_totalPrincipal, msg.sender);
        FHE.allowThis(payout);
        FHE.allowTransient(payout, address(asset));
        asset.confidentialTransfer(msg.sender, payout);

        emit Withdrawn(msg.sender);
    }

    /// @notice Funds the encrypted reward reserve used to simulate the 12% APY program.
    function fundRewards(externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyOwner nonReentrant {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);
        FHE.allowTransient(requested, address(asset));

        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), requested);
        _rewardReserve = FHE.add(_rewardReserve, transferred);
        FHE.allowThis(_rewardReserve);
        FHE.allow(_rewardReserve, owner());

        emit RewardsFunded();
    }

    /// @notice Pays time-weighted simulated rewards from the reserve into the prize pool.
    function fundPrizePool(address prizePool) external onlyOwner nonReentrant {
        if (prizePool == address(0)) revert ZeroAddress();
        uint64 readyAt = lastRewardFundedAt + REWARD_FUNDING_COOLDOWN;
        if (lastRewardFundedAt != 0 && block.timestamp < readyAt) revert RewardFundingCooldown(readyAt);

        _accrueRewards();
        euint128 availableReward = FHE.min(_accruedReward, FHE.asEuint128(_rewardReserve));
        euint64 capacity = IConfidentialPrizeReceiver(prizePool).preparePrizeCapacity();
        euint64 payout = FHE.min(FHE.asEuint64(availableReward), capacity);
        _accruedReward = FHE.sub(_accruedReward, FHE.asEuint128(payout));
        _rewardReserve = FHE.sub(_rewardReserve, payout);
        lastRewardFundedAt = uint64(block.timestamp);

        FHE.allowThis(_accruedReward);
        FHE.allow(_accruedReward, owner());
        FHE.allowThis(_rewardReserve);
        FHE.allow(_rewardReserve, owner());
        FHE.allowThis(payout);
        FHE.allowTransient(payout, address(asset));

        euint64 transferred = asset.confidentialTransfer(prizePool, payout);
        FHE.allowTransient(transferred, prizePool);
        IConfidentialPrizeReceiver(prizePool).receivePrizeFromSource(transferred);

        emit PrizePoolFunded(prizePool);
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function totalPrincipal() external view returns (euint64) {
        return _totalPrincipal;
    }

    function rewardReserve() external view returns (euint64) {
        return _rewardReserve;
    }

    function accruedReward() external view returns (euint128) {
        return _accruedReward;
    }

    function _accrueRewards() private {
        uint64 accruedAt = uint64(block.timestamp);
        uint64 elapsed = accruedAt - lastAccruedAt;
        lastAccruedAt = accruedAt;
        if (elapsed == 0) return;

        euint128 annualReward = FHE.div(
            FHE.mul(FHE.asEuint128(_totalPrincipal), uint128(TARGET_APY_BPS)),
            uint128(10_000)
        );
        euint128 elapsedReward = FHE.div(
            FHE.mul(annualReward, uint128(elapsed)),
            uint128(REWARD_ACCRUAL_PERIOD)
        );
        _accruedReward = FHE.add(_accruedReward, elapsedReward);
        FHE.allowThis(_accruedReward);
        FHE.allow(_accruedReward, owner());
    }
}
