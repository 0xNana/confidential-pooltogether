import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { useDecryptValues, useEncrypt, useGrantPermit, useHasPermit, useClearCredentials } from "@zama-fhe/react-sdk"
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroHash,
  type Eip1193Provider,
  type Log,
  type TransactionReceipt,
} from "ethers"
import {
  ASSET_ABI,
  CHAIN_ID,
  DEFAULT_MARKET,
  DRAW_PHASES,
  MARKETS,
  POOL_ABI,
  LIQUIDITY_VAULT_ABI,
  SEPOLIA_RPC_URL,
  UNDERLYING_ABI,
  type Address,
  type MarketId,
} from "../lib/contracts"
import { fetchRecentLogs } from "../lib/rpc-logs"
import {
  fetchIndexedActivity,
  subscribeToIndexedActivity,
  type PublicActivityItem,
} from "../lib/supabase-events"
import { parseTokenAmount } from "../lib/fhevm"
import { validateActionAmount } from "../lib/action-validation"

export type PoolState = {
  drawId: number
  phase: number
  phaseLabel: string
  drawClosesAt: number
  claimClosesAt: number
  participantCount: number
  scanCursor: number
  claimable: boolean
  deploymentBlock?: number
}

export type ActivityItem = PublicActivityItem

export type OperationStage = "idle" | "preparing" | "encrypting" | "signature" | "pending" | "confirmed" | "error"

export type OperationState = {
  kind?: "deposit" | "withdraw" | "operator" | "preview" | "claim" | "permit" | "fund"
  stage: OperationStage
  title?: string
  hash?: string
  error?: string
}

const readProvider = new JsonRpcProvider(SEPOLIA_RPC_URL, CHAIN_ID, { staticNetwork: true })
const poolInterface = new Interface(POOL_ABI)
const cachedDeploymentBlocks: Partial<Record<MarketId, number>> = {}
const initialPoolState: PoolState = {
  drawId: 0,
  phase: 0,
  phaseLabel: DRAW_PHASES[0],
  drawClosesAt: 0,
  claimClosesAt: 0,
  participantCount: 0,
  scanCursor: 0,
  claimable: false,
}

export function useConfidentialPoolTogether() {
  const { address: connectedAddress } = useAccount()
  const walletChainId = useChainId()
  const { connectAsync, connectors } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const { mutateAsync: zamaEncrypt } = useEncrypt()
  const { mutateAsync: grantPermit } = useGrantPermit()
  const { mutate: clearCredentials } = useClearCredentials()
  const account = connectedAddress as Address | undefined
  const [activeMarketId, setActiveMarketId] = useState<MarketId>(DEFAULT_MARKET.id)
  const activeMarket = MARKETS[activeMarketId]
  const [browserProvider, setBrowserProvider] = useState<BrowserProvider>()
  const [poolState, setPoolState] = useState(initialPoolState)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [principalHandle, setPrincipalHandle] = useState<string>()
  const [walletHandle, setWalletHandle] = useState<string>()
  const [prizeHandle, setPrizeHandle] = useState<`0x${string}`>()
  const [principal, setPrincipal] = useState<bigint>()
  const [walletBalance, setWalletBalance] = useState<bigint>()
  const [underlyingBalance, setUnderlyingBalance] = useState<bigint>()
  const [vaultTvlHandle, setVaultTvlHandle] = useState<string>()
  const [vaultTvl, setVaultTvl] = useState<bigint>()
  const [prize, setPrize] = useState<bigint>()
  const [isOperator, setIsOperator] = useState(false)
  const [decryptInputs, setDecryptInputs] = useState<Array<{ encryptedValue: `0x${string}`; contractAddress: Address }>>([])
  const [decryptTarget, setDecryptTarget] = useState<"position" | "prize">()
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState<string>()
  const [operation, setOperation] = useState<OperationState>({ stage: "idle" })

  const correctChain = walletChainId === CHAIN_ID
  const walletAvailable = typeof window !== "undefined" && Boolean(window.ethereum)
  const permitQuery = useHasPermit({ contractAddresses: [activeMarket.poolAddress, activeMarket.assetAddress, activeMarket.liquidityVaultAddress] }, { enabled: Boolean(account && correctChain) })
  const decryptQuery = useDecryptValues(decryptInputs, { enabled: decryptInputs.length > 0 })
  const permitReady = permitQuery.data ?? false
  const relayerStatus: "idle" | "loading" | "ready" | "error" = account && correctChain ? "ready" : "idle"

  const selectMarket = useCallback((marketId: MarketId) => {
    setActiveMarketId(marketId)
    setPrincipal(undefined)
    setWalletBalance(undefined)
    setUnderlyingBalance(undefined)
    setVaultTvl(undefined)
    setPrize(undefined)
    setPrizeHandle(undefined)
    setDecryptInputs([])
    setDecryptTarget(undefined)
    setIsOperator(false)
  }, [])

  const refreshActivity = useCallback(async () => {
    try {
      const indexed = await fetchIndexedActivity(activeMarket.poolAddress, 7)
      if (indexed !== undefined) {
        setActivity(indexed)
        return
      }
    } catch {
      // A configured index may be temporarily unavailable; use a bounded RPC fallback.
    }

    try {
      if (cachedDeploymentBlocks[activeMarket.id] === undefined) {
        const deployReceipt = await readProvider.getTransactionReceipt(activeMarket.deploymentTx)
        cachedDeploymentBlocks[activeMarket.id] = deployReceipt?.blockNumber
        if (cachedDeploymentBlocks[activeMarket.id] !== undefined) {
          setPoolState((previous) => ({ ...previous, deploymentBlock: cachedDeploymentBlocks[activeMarket.id] }))
        }
      }

      const deploymentBlock = cachedDeploymentBlocks[activeMarket.id]
      if (deploymentBlock === undefined) return
      const currentBlock = await readProvider.getBlockNumber()
      const recent = await fetchRecentLogs(
        (range) => readProvider.getLogs({ address: activeMarket.poolAddress, ...range }),
        deploymentBlock,
        currentBlock,
        { chunkSize: 500, maxLookback: 5_000, limit: 7 },
      )
      if (recent.complete || recent.logs.length > 0) setActivity(parseActivity(recent.logs).slice(0, 7))
    } catch {
      // Activity metadata is best-effort and must not invalidate live pool state.
    }
  }, [activeMarket])

  const refresh = useCallback(async (includeActivity = false) => {
    setReadError(undefined)
    try {
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, readProvider)
      const asset = new Contract(activeMarket.assetAddress, ASSET_ABI, readProvider)
      const underlying = new Contract(activeMarket.underlyingAddress, UNDERLYING_ABI, readProvider)
      const liquidityVault = new Contract(activeMarket.liquidityVaultAddress, LIQUIDITY_VAULT_ABI, readProvider)
      const [drawIdRaw, phaseRaw, drawClosesAtRaw, participantCountRaw, scanCursorRaw] =
        await Promise.all([
          pool.drawId(),
          pool.phase(),
          pool.drawClosesAt(),
          pool.participantCount(),
          pool.scanCursor(),
        ])
      const drawId = Number(drawIdRaw)
      const phase = Number(phaseRaw)
      const [claimableRaw, claimClosesAtRaw] = await Promise.all([
        pool.drawClaimable(drawId),
        pool.drawClaimClosesAt(drawId),
      ])
      const claimClosesAt = Number(claimClosesAtRaw)
      const claimable = Boolean(claimableRaw) && claimClosesAt > Math.floor(Date.now() / 1000)
      setPoolState({
        drawId,
        phase,
        phaseLabel: DRAW_PHASES[phase] ?? "Unknown",
        drawClosesAt: Number(drawClosesAtRaw),
        claimClosesAt,
        participantCount: Number(participantCountRaw),
        scanCursor: Number(scanCursorRaw),
        claimable,
        deploymentBlock: cachedDeploymentBlocks[activeMarket.id],
      })

      if (account) {
        const [nextPrincipalHandle, nextWalletHandle, nextUnderlyingBalance, operator] = await Promise.all([
          pool.principalOf(account),
          asset.confidentialBalanceOf(account),
          underlying.balanceOf(account),
          asset.isOperator(account, activeMarket.poolAddress),
        ])
        setVaultTvlHandle(String(await liquidityVault.totalPrincipal()))
        setPrincipalHandle(String(nextPrincipalHandle))
        setWalletHandle(String(nextWalletHandle))
        setUnderlyingBalance(BigInt(nextUnderlyingBalance))
        setIsOperator(Boolean(operator))
      } else {
        setPrincipalHandle(undefined)
        setWalletHandle(undefined)
        setVaultTvlHandle(undefined)
        setUnderlyingBalance(undefined)
        setIsOperator(false)
      }

      if (includeActivity) await refreshActivity()
    } catch (error) {
      setReadError(errorMessage(error, "Could not read the Sepolia deployment."))
    } finally {
      setLoading(false)
    }
  }, [account, activeMarket, refreshActivity])

  useEffect(() => {
    void refresh(true)
    const interval = window.setInterval(() => void refresh(), 20_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    let disposed = false
    let unsubscribe: () => void = () => {}
    void subscribeToIndexedActivity(activeMarket.poolAddress, () => void refreshActivity()).then((cleanup) => {
      if (disposed) cleanup()
      else unsubscribe = cleanup
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [activeMarket.poolAddress, refreshActivity])

  useEffect(() => {
    setBrowserProvider(account && window.ethereum ? new BrowserProvider(window.ethereum as unknown as Eip1193Provider) : undefined)
    setPrincipal(undefined)
    setWalletBalance(undefined)
    setUnderlyingBalance(undefined)
    setVaultTvl(undefined)
    setPrize(undefined)
    setPrizeHandle(undefined)
    setDecryptInputs([])
    setDecryptTarget(undefined)
  }, [account])

  useEffect(() => {
    if (!decryptTarget || !decryptQuery.data) return
    if (decryptTarget === "position") {
      const principalKey = principalHandle as `0x${string}` | undefined
      const walletKey = walletHandle as `0x${string}` | undefined
      setPrincipal(principalKey && principalKey !== ZeroHash ? BigInt(decryptQuery.data[principalKey] ?? 0) : 0n)
      setWalletBalance(walletKey && walletKey !== ZeroHash ? BigInt(decryptQuery.data[walletKey] ?? 0) : 0n)
      const tvlKey = vaultTvlHandle as `0x${string}` | undefined
      const canRevealTvl = account?.toLowerCase() === activeMarket.liquidityVaultDeployer.toLowerCase()
      setVaultTvl(canRevealTvl && tvlKey && tvlKey !== ZeroHash ? BigInt(decryptQuery.data[tvlKey] ?? 0) : undefined)
      setOperation({ stage: "confirmed", title: "Confidential values revealed locally" })
    } else if (prizeHandle) {
      setPrize(BigInt(decryptQuery.data[prizeHandle] ?? 0))
      setOperation((previous) => ({ ...previous, stage: "confirmed", title: "Prize result revealed locally" }))
    }
    setDecryptInputs([])
    setDecryptTarget(undefined)
  }, [account, activeMarket.liquidityVaultDeployer, decryptQuery.data, decryptTarget, principalHandle, prizeHandle, vaultTvlHandle, walletHandle])

  useEffect(() => {
    if (!decryptTarget || !decryptQuery.error) return
    setOperation({ stage: "error", error: errorMessage(decryptQuery.error, "Threshold decryption failed.") })
    setDecryptInputs([])
    setDecryptTarget(undefined)
  }, [decryptQuery.error, decryptTarget])

  const connect = useCallback(async () => {
    if (!walletAvailable || connectors.length === 0) {
      setOperation({ stage: "error", error: "Install an EIP-1193 wallet such as MetaMask or Rabby." })
      return
    }
    try {
      setOperation({ stage: "preparing", title: "Connecting wallet" })
      await connectAsync({ connector: connectors[0] })
      setOperation({ stage: "idle" })
    } catch (error) {
      setOperation({ stage: "error", error: errorMessage(error, "Wallet connection was cancelled.") })
    }
  }, [connectAsync, connectors, walletAvailable])

  const switchNetwork = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: CHAIN_ID })
    } catch (error) {
      setOperation({ stage: "error", error: errorMessage(error, "Switch to Sepolia in your wallet.") })
    }
  }, [switchChainAsync])

  const authorizeReads = useCallback(async () => {
    if (!account || !correctChain) return
    try {
      setOperation({ kind: "permit", stage: "signature", title: "Authorize confidential reads" })
      await grantPermit([activeMarket.poolAddress, activeMarket.assetAddress, activeMarket.liquidityVaultAddress])
      await permitQuery.refetch()
      setOperation({ kind: "permit", stage: "confirmed", title: "Private session authorized" })
    } catch (error) {
      setOperation({ kind: "permit", stage: "error", error: errorMessage(error, "Could not authorize private reads.") })
    }
  }, [account, activeMarket, correctChain, grantPermit, permitQuery])

  const revealPosition = useCallback(async () => {
    if (!account || !permitReady) return
    try {
      setOperation({ stage: "preparing", title: "Requesting threshold decryption" })
      const inputs: Array<{ encryptedValue: `0x${string}`; contractAddress: Address }> = []
      if (principalHandle && principalHandle !== ZeroHash) inputs.push({ encryptedValue: principalHandle as `0x${string}`, contractAddress: activeMarket.poolAddress })
      if (walletHandle && walletHandle !== ZeroHash) inputs.push({ encryptedValue: walletHandle as `0x${string}`, contractAddress: activeMarket.assetAddress })
      if (vaultTvlHandle && vaultTvlHandle !== ZeroHash && account.toLowerCase() === activeMarket.liquidityVaultDeployer.toLowerCase()) {
        inputs.push({ encryptedValue: vaultTvlHandle as `0x${string}`, contractAddress: activeMarket.liquidityVaultAddress })
      }
      if (inputs.length === 0) {
        setPrincipal(0n)
        setWalletBalance(0n)
        setOperation({ stage: "confirmed", title: "Confidential values revealed locally" })
        return
      }
      setDecryptTarget("position")
      setDecryptInputs(inputs)
    } catch (error) {
      setOperation({ stage: "error", error: errorMessage(error, "Threshold decryption failed.") })
    }
  }, [account, activeMarket, permitReady, principalHandle, vaultTvlHandle, walletHandle])

  const approveOperator = useCallback(async () => {
    if (!browserProvider || !correctChain) return
    try {
      setOperation({ kind: "operator", stage: "signature", title: "Approve 30-day pool access" })
      const signer = await browserProvider.getSigner()
      const asset = new Contract(activeMarket.assetAddress, ASSET_ABI, signer)
      const until = Math.floor(Date.now() / 1000) + 30 * 86_400
      const tx = await asset.setOperator(activeMarket.poolAddress, until)
      setOperation({ kind: "operator", stage: "pending", title: "Recording ERC-7984 operator", hash: tx.hash })
      await waitForSuccess(tx.wait())
      setIsOperator(true)
      setOperation({ kind: "operator", stage: "confirmed", title: "Pool access approved", hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "operator", stage: "error", error: errorMessage(error, "Operator approval failed.") })
    }
  }, [activeMarket, browserProvider, correctChain, refresh])

  const transact = useCallback(async (kind: "deposit" | "withdraw", amountInput: string) => {
    if (!account || !browserProvider || !correctChain) return
    try {
      const validationError = validateActionAmount(
        kind,
        amountInput,
        kind === "deposit" ? walletBalance : principal,
      )
      if (validationError) throw new Error(validationError)
      const amount = parseTokenAmount(amountInput)
      if (kind === "deposit" && !isOperator) throw new Error("Approve Confidential PoolTogether as an ERC-7984 operator first.")
      setOperation({ kind, stage: "encrypting", title: "Encrypting amount and generating proof" })
      const encrypted = await zamaEncrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: activeMarket.poolAddress,
        userAddress: account,
      })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool[kind](encrypted.encryptedValues[0], encrypted.inputProof)
      setOperation({ kind, stage: "pending", title: "Confidential transaction pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      setPrincipal(undefined)
      setWalletBalance(undefined)
      setPrize(undefined)
      setOperation({ kind, stage: "confirmed", title: `Encrypted ${kind === "deposit" ? "deposit" : "withdrawal"} confirmed`, hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind, stage: "error", error: errorMessage(error, `${kind === "deposit" ? "Deposit" : "Withdrawal"} failed.`) })
      throw error
    }
  }, [account, activeMarket, browserProvider, correctChain, isOperator, principal, refresh, walletBalance, zamaEncrypt])

  const previewPrize = useCallback(async () => {
    if (!account || !browserProvider || !correctChain || !poolState.claimable) return
    try {
      setOperation({ kind: "preview", stage: "signature", title: "Create encrypted prize preview" })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.previewPrize(poolState.drawId)
      setOperation({ kind: "preview", stage: "pending", title: "Computing prize-or-zero", hash: tx.hash })
      await waitForSuccess(tx.wait())
      const handle = String(await pool.prizePreviewOf(poolState.drawId, account))
      if (!permitReady) {
        setOperation({ kind: "preview", stage: "confirmed", title: "Preview ready — authorize a private session to reveal", hash: tx.hash })
        return
      }
      setPrizeHandle(handle as `0x${string}`)
      setDecryptTarget("prize")
      setDecryptInputs([{ encryptedValue: handle as `0x${string}`, contractAddress: activeMarket.poolAddress }])
      setOperation({ kind: "preview", stage: "preparing", title: "Decrypting private result", hash: tx.hash })
    } catch (error) {
      setOperation({ kind: "preview", stage: "error", error: errorMessage(error, "Prize preview failed.") })
    }
  }, [account, activeMarket.poolAddress, browserProvider, correctChain, permitReady, poolState.claimable, poolState.drawId])

  const claimPrize = useCallback(async () => {
    if (!browserProvider || !correctChain || prize === undefined || prize === 0n) return
    try {
      setOperation({ kind: "claim", stage: "signature", title: "Confirm private prize claim" })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.claimPrize(poolState.drawId)
      setOperation({ kind: "claim", stage: "pending", title: "Prize claim pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      setPrize(0n)
      setWalletBalance(undefined)
      setOperation({ kind: "claim", stage: "confirmed", title: "Prize transferred confidentially", hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "claim", stage: "error", error: errorMessage(error, "Prize claim failed.") })
    }
  }, [activeMarket.poolAddress, browserProvider, correctChain, poolState.drawId, prize, refresh])

  const fundTestnet = useCallback(async () => {
    if (!account || !browserProvider || !correctChain) return
    const amount = parseTokenAmount("1000")
    try {
      const signer = await browserProvider.getSigner()
      const underlying = new Contract(activeMarket.underlyingAddress, UNDERLYING_ABI, signer)
      const wrapper = new Contract(activeMarket.assetAddress, ASSET_ABI, signer)

      setOperation({ kind: "fund", stage: "signature", title: `Mint 1,000 official test ${activeMarket.underlyingSymbol}` })
      const mintTx = await underlying.mint(account, amount)
      setOperation({ kind: "fund", stage: "pending", title: `Minting test ${activeMarket.underlyingSymbol}`, hash: mintTx.hash })
      await waitForSuccess(mintTx.wait())

      const allowance = BigInt(await underlying.allowance(account, activeMarket.assetAddress))
      if (allowance < amount) {
        setOperation({ kind: "fund", stage: "signature", title: `Approve the official ${activeMarket.tokenSymbol} wrapper` })
        const approveTx = await underlying.approve(activeMarket.assetAddress, amount)
        setOperation({ kind: "fund", stage: "pending", title: `Approving test ${activeMarket.underlyingSymbol}`, hash: approveTx.hash })
        await waitForSuccess(approveTx.wait())
      }

      setOperation({ kind: "fund", stage: "signature", title: `Shield test ${activeMarket.underlyingSymbol} into ${activeMarket.tokenSymbol}` })
      const wrapTx = await wrapper.wrap(account, amount)
      setOperation({ kind: "fund", stage: "pending", title: `Creating confidential ${activeMarket.tokenSymbol}`, hash: wrapTx.hash })
      await waitForSuccess(wrapTx.wait())
      setWalletBalance(undefined)
      setOperation({ kind: "fund", stage: "confirmed", title: `1,000 official test ${activeMarket.tokenSymbol} ready`, hash: wrapTx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "fund", stage: "error", error: errorMessage(error, "Testnet funding failed.") })
    }
  }, [account, activeMarket, browserProvider, correctChain, refresh])

  const disconnect = useCallback(() => {
    clearCredentials()
    void disconnectAsync()
    setBrowserProvider(undefined)
    setPrincipal(undefined)
    setWalletBalance(undefined)
    setUnderlyingBalance(undefined)
    setPrize(undefined)
    setOperation({ stage: "idle" })
  }, [clearCredentials, disconnectAsync])

  const clearOperation = useCallback(() => setOperation({ stage: "idle" }), [])

  return useMemo(() => ({
    account,
    activeMarket,
    markets: MARKETS,
    walletAvailable,
    walletChainId,
    correctChain,
    poolState,
    activity,
    principal,
    walletBalance,
    underlyingBalance,
    vaultTvl,
    browserProvider,
    prize,
    isOperator,
    permitReady,
    relayerStatus,
    loading,
    readError,
    operation,
    connect,
    selectMarket,
    disconnect,
    switchNetwork,
    authorizeReads,
    revealPosition,
    approveOperator,
    transact,
    previewPrize,
    claimPrize,
    fundTestnet,
    refresh,
    clearOperation,
  }), [
    account, activeMarket, walletAvailable, walletChainId, correctChain, poolState, activity, principal, walletBalance, underlyingBalance, vaultTvl, browserProvider,
    prize, isOperator, permitReady, relayerStatus, loading, readError, operation, connect, disconnect,
    switchNetwork, authorizeReads, revealPosition, approveOperator, selectMarket, transact, previewPrize, claimPrize, fundTestnet, refresh,
    clearOperation,
  ])
}

export type ConfidentialPoolTogetherModel = ReturnType<typeof useConfidentialPoolTogether>

function parseActivity(logs: Log[]): ActivityItem[] {
  const labels: Record<string, string> = {
    DepositRecorded: "Encrypted deposit accepted",
    WithdrawalRecorded: "Principal withdrawal recorded",
    PrizeFunded: "Yield entered the prize reserve",
    DrawOpened: "New private draw opened",
    DrawSelectionStarted: "Verifiable selection started",
    DrawSelectionProgress: "Encrypted winner scan advanced",
    DrawClaimable: "Private prize claims enabled",
    PrizeRolledOver: "Encrypted prize reserve rolled forward",
    PrizeClaimAttempted: "Prize-or-zero claim submitted",
  }
  return logs.flatMap((log) => {
    try {
      const parsed = poolInterface.parseLog(log)
      if (!parsed || !labels[parsed.name]) return []
      const rawDrawId = parsed.args.drawId ?? parsed.args.toDrawId
      const drawId = rawDrawId === undefined ? undefined : Number(rawDrawId)
      return [{
        id: `${log.transactionHash}-${log.index}`,
        event: parsed.name,
        label: labels[parsed.name],
        blockNumber: log.blockNumber,
        drawId,
        transactionHash: log.transactionHash,
      }]
    } catch {
      return []
    }
  }).sort((a, b) => b.blockNumber - a.blockNumber)
}

function recordActivityFromReceipt(
  receipt: TransactionReceipt,
  setActivity: Dispatch<SetStateAction<ActivityItem[]>>,
) {
  const next = parseActivity(receipt.logs as Log[])
  if (next.length === 0) return
  setActivity((previous) => {
    const merged = [...next, ...previous]
    return merged.filter((item, index) => merged.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 7)
  })
}

async function waitForSuccess(receiptPromise: Promise<TransactionReceipt | null>) {
  const receipt = await receiptPromise
  if (!receipt || receipt.status !== 1) throw new Error("Transaction reverted on Sepolia.")
  return receipt
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message
      .replace(/\s*\(action=.*$/s, "")
      .replace(/^execution reverted:\s*/i, "")
    if (/user rejected|rejected the request|ACTION_REJECTED/i.test(message)) return "Request cancelled in wallet."
    if (/insufficient funds/i.test(message)) return "Not enough Sepolia ETH to pay gas."
    if (/DrawNotOpen/i.test(message)) return "Deposits are paused while this draw is closing."
    if (/DrawNotClaimable/i.test(message)) return "This draw is not claimable yet."
    return message || fallback
  }
  return fallback
}
