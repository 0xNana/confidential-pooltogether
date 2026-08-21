import deployment from "../generated/deployment.json"
import deploymentUsdc from "../generated/deployment-usdc.json"
import liquidityVault from "../generated/liquidity-vault.json"
import liquidityVaultUsdc from "../generated/liquidity-vault-usdc.json"

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
  liquidityVaultAddress: Address
  liquidityVaultDeployer: Address
  liquidityVaultApyAccounting: boolean
  liquidityVaultRewardSourceConfigured: boolean
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
    liquidityVaultAddress: liquidityVault.vault as Address,
    liquidityVaultDeployer: liquidityVault.deployer as Address,
    liquidityVaultApyAccounting: Boolean(liquidityVault.apyAccounting),
    liquidityVaultRewardSourceConfigured: Boolean(liquidityVault.rewardSourceConfigured),
  },
  cUSDC: {
    id: "cUSDC",
    tokenSymbol: deploymentUsdc.tokenSymbol ?? "cUSDC",
    underlyingSymbol: deploymentUsdc.underlyingSymbol ?? "USDC",
    poolAddress: deploymentUsdc.pool as Address,
    assetAddress: deploymentUsdc.asset as Address,
    underlyingAddress: deploymentUsdc.underlying as Address,
    deploymentTx: deploymentUsdc.transactionHash as `0x${string}`,
    liquidityVaultAddress: liquidityVaultUsdc.vault as Address,
    liquidityVaultDeployer: liquidityVaultUsdc.deployer as Address,
    liquidityVaultApyAccounting: Boolean(liquidityVaultUsdc.apyAccounting),
    liquidityVaultRewardSourceConfigured: Boolean(liquidityVaultUsdc.rewardSourceConfigured),
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
export const SEPOLIA_RPC_URL =
  import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"

export const POOL_ABI = [
  "function phase() view returns (uint8)",
  "function drawId() view returns (uint64)",
  "function drawClosesAt() view returns (uint64)",
  "function drawClaimClosesAt(uint64) view returns (uint64)",
  "function DRAW_PERIOD() view returns (uint64)",
  "function CLAIM_PERIOD() view returns (uint64)",
  "function scanCursor() view returns (uint256)",
  "function rewardSource() view returns (address)",
  "function participantCount() view returns (uint256)",
  "function drawClaimable(uint64) view returns (bool)",
  "function principalOf(address) view returns (bytes32)",
  "function prizePreviewOf(uint64,address) view returns (bytes32)",
  "function setRewardSource(address)",
  "function receivePrizeFromSource(bytes32)",
  "function deposit(bytes32,bytes)",
  "function withdraw(bytes32,bytes)",
  "function previewPrize(uint64)",
  "function claimPrize(uint64)",
  "event DepositRecorded(address indexed account, uint64 indexed drawId)",
  "event WithdrawalRecorded(address indexed account, uint64 indexed drawId)",
  "event PrizeFunded(uint64 indexed drawId)",
  "event DrawOpened(uint64 indexed drawId, uint64 closesAt)",
  "event DrawSelectionStarted(uint64 indexed drawId, uint256 participantCount)",
  "event DrawSelectionProgress(uint64 indexed drawId, uint256 cursor, uint256 participantCount)",
  "event DrawClaimable(uint64 indexed drawId, uint64 claimClosesAt)",
  "event PrizeRolledOver(uint64 indexed fromDrawId, uint64 indexed toDrawId)",
  "event PrizeClaimAttempted(address indexed account, uint64 indexed drawId)",
] as const

export const LIQUIDITY_VAULT_ABI = [
  "function asset() view returns (address)",
  "function MATURITY_PERIOD() view returns (uint64)",
  "function REWARD_FUNDING_COOLDOWN() view returns (uint64)",
  "function TARGET_APY_BPS() view returns (uint64)",
  "function PROGRAM_REWARD_BPS() view returns (uint64)",
  "function maturityOf(address) view returns (uint64)",
  "function principalOf(address) view returns (bytes32)",
  "function totalPrincipal() view returns (bytes32)",
  "function rewardReserve() view returns (bytes32)",
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

export const DRAW_PHASES = ["Open", "Selecting winner", "Claimable"] as const
