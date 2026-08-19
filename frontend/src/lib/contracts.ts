import deployment from "../generated/deployment.json"

export type Address = `0x${string}`

export const CHAIN_ID = deployment.chainId
export const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`
export const POOL_ADDRESS = deployment.pool as Address
export const ASSET_ADDRESS = deployment.asset as Address
// Official Zama Sepolia cUSDTMock underlying from the protocol address registry.
export const UNDERLYING_ADDRESS = "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0" as Address
export const DEPLOYMENT_TX = deployment.transactionHash as `0x${string}`
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
  "function participantCount() view returns (uint256)",
  "function drawClaimable(uint64) view returns (bool)",
  "function principalOf(address) view returns (bytes32)",
  "function prizePreviewOf(uint64,address) view returns (bytes32)",
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
