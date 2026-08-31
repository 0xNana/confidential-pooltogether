import deployment from "../generated/deployment.json"
import deploymentUsdc from "../generated/deployment-usdc.json"
import liquidityVault from "../generated/liquidity-vault.json"
import liquidityVaultUsdc from "../generated/liquidity-vault-usdc.json"
import { PUBLIC_SEPOLIA_RPC_URLS } from "../../sepolia-rpc-endpoints.mjs"

export type Address = `0x${string}`
export type MarketId = "cUSDT" | "cUSDC"
export type MarketConfig = {
  id: MarketId
  tokenSymbol: string
  underlyingSymbol: string
  poolAddress: Address
  assetAddress: Address
  underlyingAddress: Address
  deploymentTx: `0x${string}`
  deploymentBlock?: number
  liquidityVaultAddress: Address
  liquidityVaultDeployer: Address
  liquidityVaultApyAccounting: boolean
  liquidityVaultRewardSourceConfigured: boolean
  drawScopedEnrollment: boolean
}

export const MARKETS: Record<MarketId, MarketConfig> = {
  cUSDT: {
    id: "cUSDT",
    tokenSymbol: deployment.tokenSymbol ?? "cUSDT",
    underlyingSymbol: deployment.underlyingSymbol ?? "USDT",
    poolAddress: deployment.pool as Address,
    assetAddress: deployment.asset as Address,
    underlyingAddress: (deployment.underlying ?? "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0") as Address,
    deploymentTx: deployment.transactionHash as `0x${string}`,
    deploymentBlock: "deploymentBlock" in deployment && typeof deployment.deploymentBlock === "number" ? deployment.deploymentBlock : undefined,
    liquidityVaultAddress: liquidityVault.vault as Address,
    liquidityVaultDeployer: liquidityVault.deployer as Address,
    liquidityVaultApyAccounting: Boolean(liquidityVault.apyAccounting) && "rewardAccrualModel" in liquidityVault && liquidityVault.rewardAccrualModel === "encrypted-time-weighted-v2",
    liquidityVaultRewardSourceConfigured: Boolean(liquidityVault.rewardSourceConfigured),
    drawScopedEnrollment: deployment.privacyModel === "continuous-confidential-draws-v1",
  },
  cUSDC: {
    id: "cUSDC",
    tokenSymbol: deploymentUsdc.tokenSymbol ?? "cUSDC",
    underlyingSymbol: deploymentUsdc.underlyingSymbol ?? "USDC",
    poolAddress: deploymentUsdc.pool as Address,
    assetAddress: deploymentUsdc.asset as Address,
    underlyingAddress: deploymentUsdc.underlying as Address,
    deploymentTx: deploymentUsdc.transactionHash as `0x${string}`,
    deploymentBlock: "deploymentBlock" in deploymentUsdc && typeof deploymentUsdc.deploymentBlock === "number" ? deploymentUsdc.deploymentBlock : undefined,
    liquidityVaultAddress: liquidityVaultUsdc.vault as Address,
    liquidityVaultDeployer: liquidityVaultUsdc.deployer as Address,
    liquidityVaultApyAccounting: Boolean(liquidityVaultUsdc.apyAccounting) && "rewardAccrualModel" in liquidityVaultUsdc && liquidityVaultUsdc.rewardAccrualModel === "encrypted-time-weighted-v2",
    liquidityVaultRewardSourceConfigured: Boolean(liquidityVaultUsdc.rewardSourceConfigured),
    drawScopedEnrollment: deploymentUsdc.privacyModel === "continuous-confidential-draws-v1",
  },
}

export const CHAIN_ID = deployment.chainId
export const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`
export const DEFAULT_MARKET = MARKETS.cUSDT
export const POOL_ADDRESS = DEFAULT_MARKET.poolAddress
export const LIQUIDITY_VAULT_ADDRESS = DEFAULT_MARKET.liquidityVaultAddress
export const LIQUIDITY_VAULT_DEPLOYER = DEFAULT_MARKET.liquidityVaultDeployer
export const LIQUIDITY_VAULT_APY_ACCOUNTING = DEFAULT_MARKET.liquidityVaultApyAccounting
export const LIQUIDITY_VAULT_REWARD_SOURCE_CONFIGURED = DEFAULT_MARKET.liquidityVaultRewardSourceConfigured
export const ASSET_ADDRESS = DEFAULT_MARKET.assetAddress
export const UNDERLYING_ADDRESS = DEFAULT_MARKET.underlyingAddress
export const DEPLOYMENT_TX = DEFAULT_MARKET.deploymentTx
export const TOKEN_DECIMALS = 6
const configuredRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL?.trim()
const configuredFallbackRpcUrls = import.meta.env.VITE_SEPOLIA_FALLBACK_RPC_URLS
  ?.split(",")
  .map((url: string) => url.trim())
  .filter(Boolean) ?? []
export const HAS_DEDICATED_SEPOLIA_RPC = Boolean(configuredRpcUrl)
export const SEPOLIA_RPC_URLS = Array.from(new Set([
  ...(configuredRpcUrl ? [configuredRpcUrl] : []),
  ...configuredFallbackRpcUrls,
  ...PUBLIC_SEPOLIA_RPC_URLS,
]))
export const SEPOLIA_RPC_URL = SEPOLIA_RPC_URLS[0]
export const SEPOLIA_FHE_RPC_URL = import.meta.env.VITE_SEPOLIA_FHE_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com"

export const DRAW_STATUSES = ["Open", "Selecting", "Claimable", "Expired", "Swept"] as const

export const POOL_ABI = [
  "function currentDrawId() view returns (uint64)",
  "function drawEpoch() view returns (uint64)",
  "function drawMetadata(uint64) view returns (tuple(uint64 scheduledOpen,uint64 scheduledClose,uint64 claimableAt,uint64 claimExpiresAt,uint32 participantCount,uint32 scanCursor,uint8 status))",
  "function currentDrawMetadata() view returns (tuple(uint64 scheduledOpen,uint64 scheduledClose,uint64 claimableAt,uint64 claimExpiresAt,uint32 participantCount,uint32 scanCursor,uint8 status))",
  "function DRAW_PERIOD() view returns (uint64)",
  "function CLAIM_PERIOD() view returns (uint64)",
  "function MAX_SCAN_BATCH() view returns (uint256)",
  "function MAX_ACTIONABLE_QUERY() view returns (uint256)",
  "function MAX_POOL_PRINCIPAL() view returns (uint64)",
  "function MAX_PRIZE_RESERVES() view returns (uint64)",
  "function rewardSource() view returns (address)",
  "function participantCount() view returns (uint256)",
  "function isEnteredCurrent(address) view returns (bool)",
  "function isEntered(uint64,address) view returns (bool)",
  "function actionableDrawCount() view returns (uint256)",
  "function actionableDrawIds(uint256,uint256) view returns (uint64[])",
  "function principalOf(address) view returns (bytes32)",
  "function prizePreviewOf(uint64,address) view returns (bytes32)",
  "function setRewardSource(address)",
  "function preparePrizeCapacity() returns (bytes32)",
  "function receivePrizeFromSource(bytes32)",
  "function deposit(bytes32,bytes)",
  "function enterDraw()",
  "function withdraw(bytes32,bytes)",
  "function previewPrize(uint64)",
  "function claimPrize(uint64)",
  "function closeDraw()",
  "function continueSelection(uint64,uint256)",
  "function expireDraw(uint64)",
  "function sweepExpiredPrize(uint64)",
  "error DrawNotFound(uint64 drawId)",
  "error DrawNotOpen(uint64 drawId)",
  "error DrawNotSelecting(uint64 drawId)",
  "error DrawNotClaimable(uint64 drawId)",
  "error DrawStillOpen(uint64 drawId,uint64 closesAt)",
  "error ClaimExpired(uint64 drawId)",
  "error DrawNotExpired(uint64 drawId)",
  "error DrawAlreadySwept(uint64 drawId)",
  "error ParticipantLimitReached(uint64 drawId)",
  "error InvalidBatchSize(uint256 supplied)",
  "event DepositRecorded(address indexed account, uint64 indexed drawId)",
  "event DrawEntered(address indexed account, uint64 indexed drawId)",
  "event WithdrawalRecorded(address indexed account, uint64 indexed drawId)",
  "event PrizeFunded(uint64 indexed drawId)",
  "event DrawOpened(uint64 indexed drawId, uint64 scheduledOpen, uint64 scheduledClose)",
  "event DrawFinalized(uint64 indexed drawId, uint32 participantCount)",
  "event SelectionProgress(uint64 indexed drawId, uint32 cursor, uint32 participantCount)",
  "event DrawClaimable(uint64 indexed drawId, uint64 claimableAt, uint64 claimExpiresAt)",
  "event DrawExpired(uint64 indexed drawId)",
  "event PrizeSwept(uint64 indexed sourceDrawId, uint64 indexed targetDrawId)",
  "event PrizeClaimAttempted(address indexed account, uint64 indexed drawId)",
] as const

export const LIQUIDITY_VAULT_ABI = [
  "function asset() view returns (address)",
  "function MATURITY_PERIOD() view returns (uint64)",
  "function REWARD_FUNDING_COOLDOWN() view returns (uint64)",
  "function REWARD_ACCRUAL_PERIOD() view returns (uint64)",
  "function TARGET_APY_BPS() view returns (uint64)",
  "function lastAccruedAt() view returns (uint64)",
  "function maturityOf(address) view returns (uint64)",
  "function principalOf(address) view returns (bytes32)",
  "function totalPrincipal() view returns (bytes32)",
  "function rewardReserve() view returns (bytes32)",
  "function accruedReward() view returns (bytes32)",
  "function fundRewards(bytes32,bytes)",
  "function fundPrizePool(address)",
  "function deposit(bytes32,bytes)",
  "function withdraw(bytes32,bytes)",
  "event RewardsFunded()",
  "event PrizePoolFunded(address indexed prizePool)",
] as const

export const ASSET_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
  "function isOperator(address,address) view returns (bool)",
  "function setOperator(address,uint48)",
  "function underlying() view returns (address)",
  "function wrap(address,uint256) returns (bytes32)",
  "event OperatorSet(address indexed holder, address indexed operator, uint48 until)",
] as const

export const UNDERLYING_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
] as const
