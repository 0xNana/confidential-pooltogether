import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useDecryptValues, useEncrypt, useGrantPermit, useHasPermit, useClearCredentials } from "@zama-fhe/react-sdk"
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import {
  BrowserProvider,
  Contract,
  FetchRequest,
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
  DRAW_STATUSES,
  MARKETS,
  POOL_ABI,
  LIQUIDITY_VAULT_ABI,
  SEPOLIA_RPC_URLS,
  UNDERLYING_ABI,
  type Address,
  type MarketId,
} from "../lib/contracts"
import { activityScanStartBlock, fetchRecentLogs } from "../lib/rpc-logs"
import {
  fetchIndexedActivity,
  subscribeToIndexedActivity,
  type PublicActivityItem,
} from "../lib/supabase-events"
import { parseTokenAmount } from "../lib/fhevm"
import { validateActionAmount } from "../lib/action-validation"
import { deriveDrawLifecycle } from "../lib/draw-lifecycle"
import { isTransientProviderError, reportDiagnostic, retryTransient, toUserError } from "../lib/user-errors"
import { deriveVaultWorkflowStep } from "../lib/vault-workflow"

export type DrawState = {
  drawId: number
  status: number
  statusLabel: string
  scheduledOpen: number
  scheduledClose: number
  claimableAt: number
  claimExpiresAt: number
  participantCount: number
  scanCursor: number
  claimable: boolean
  isEntered?: boolean
}

export type PoolState = {
  currentDraw: DrawState
  historicalDraws: DrawState[]
  claimDraw?: DrawState
  actionableDrawCount: number
  historicalOffset: number
  deploymentBlock?: number
}

export type ActivityItem = PublicActivityItem

export type OperationStage = "idle" | "preparing" | "encrypting" | "signature" | "pending" | "confirmed" | "error"

export type OperationState = {
  kind?: "deposit" | "withdraw" | "operator" | "preview" | "claim" | "permit" | "fund" | "lifecycle" | "entry"
  stage: OperationStage
  title?: string
  hash?: string
  error?: string
}

const readProviders = SEPOLIA_RPC_URLS.map((url) => {
  const request = new FetchRequest(url)
  request.timeout = 4_000
  return new JsonRpcProvider(request, CHAIN_ID, {
    staticNetwork: true,
    batchMaxCount: 20,
    batchStallTime: 10,
  })
})
let preferredReadProvider = 0
const poolInterface = new Interface(POOL_ABI)
const cachedDeploymentBlocks: Partial<Record<MarketId, number>> = {}
const HISTORICAL_PAGE_SIZE = 32
const initialDrawState: DrawState = {
  drawId: 0,
  status: 0,
  statusLabel: DRAW_STATUSES[0],
  scheduledOpen: 0,
  scheduledClose: 0,
  claimableAt: 0,
  claimExpiresAt: 0,
  participantCount: 0,
  scanCursor: 0,
  claimable: false,
}
const initialPoolState: PoolState = {
  currentDraw: initialDrawState,
  historicalDraws: [],
  actionableDrawCount: 0,
  historicalOffset: 0,
}

export function useConfidentialPoolTogether() {
  const { address: connectedAddress, chainId: connectedChainId } = useAccount()
  const configuredChainId = useChainId()
  const walletChainId = connectedChainId ?? configuredChainId
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
  const [prizeDrawId, setPrizeDrawId] = useState<number>()
  const [isOperator, setIsOperator] = useState(false)
  const [isEntered, setIsEntered] = useState<boolean>()
  const [decryptInputs, setDecryptInputs] = useState<Array<{ encryptedValue: `0x${string}`; contractAddress: Address }>>([])
  const [decryptTarget, setDecryptTarget] = useState<"position" | "prize">()
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState<string>()
  const [operation, setOperation] = useState<OperationState>({ stage: "idle" })
  const [historicalOffset, setHistoricalOffset] = useState(0)
  const claimDrawIdRef = useRef<number | undefined>(undefined)

  const correctChain = walletChainId === CHAIN_ID
  const walletAvailable = typeof window !== "undefined" && Boolean(window.ethereum)
  const permitQuery = useHasPermit({ contractAddresses: [activeMarket.poolAddress, activeMarket.assetAddress, activeMarket.liquidityVaultAddress] }, { enabled: Boolean(account && correctChain) })
  const decryptQuery = useDecryptValues(decryptInputs, { enabled: decryptInputs.length > 0 })
  const permitReady = permitQuery.data ?? false
  const relayerStatus: "idle" | "loading" | "ready" | "error" = account && correctChain ? "ready" : "idle"
  const workflowStep = deriveVaultWorkflowStep({
    account: Boolean(account),
    correctChain,
    permitReady,
    isOperator,
    principal,
    prize,
    currentDrawExpired: poolState.currentDraw.scheduledClose > 0 && Math.floor(Date.now() / 1000) >= poolState.currentDraw.scheduledClose,
    hasSelectingDraw: poolState.historicalDraws.some((draw) => draw.status === 1),
    claimable: Boolean(poolState.claimDraw?.claimable),
  })

  const selectMarket = useCallback((marketId: MarketId) => {
    setActiveMarketId(marketId)
    setLoading(true)
    setReadError(undefined)
    setPrincipal(undefined)
    setWalletBalance(undefined)
    setUnderlyingBalance(undefined)
    setVaultTvl(undefined)
    setPrize(undefined)
    setPrizeDrawId(undefined)
    setPrizeHandle(undefined)
    setDecryptInputs([])
    setDecryptTarget(undefined)
    setIsOperator(false)
    setIsEntered(undefined)
    setHistoricalOffset(0)
  }, [])

  const refreshActivity = useCallback(async () => {
    try {
      const indexed = await fetchIndexedActivity(activeMarket.poolAddress, 7)
      if (indexed !== undefined) {
        setActivity(indexed)
        return
      }
    } catch (error) {
      reportDiagnostic("activity-index", error)
      // A configured index may be temporarily unavailable; use a bounded RPC fallback.
    }

    try {
      if (cachedDeploymentBlocks[activeMarket.id] === undefined) {
        if (activeMarket.deploymentBlock !== undefined) {
          cachedDeploymentBlocks[activeMarket.id] = activeMarket.deploymentBlock
        } else {
          const deployReceipt = await withReadProvider((provider) => provider.getTransactionReceipt(activeMarket.deploymentTx))
          cachedDeploymentBlocks[activeMarket.id] = deployReceipt?.blockNumber
        }
        if (cachedDeploymentBlocks[activeMarket.id] !== undefined) {
          setPoolState((previous) => ({ ...previous, deploymentBlock: cachedDeploymentBlocks[activeMarket.id] }))
        }
      }

      const currentBlock = await withReadProvider((provider) => provider.getBlockNumber())
      const deploymentBlock = cachedDeploymentBlocks[activeMarket.id]
      const scanStartBlock = activityScanStartBlock(deploymentBlock, currentBlock)
      const recent = await fetchRecentLogs(
        (range) => withReadProvider((provider) => provider.getLogs({ address: activeMarket.poolAddress, ...range })),
        scanStartBlock,
        currentBlock,
        { chunkSize: 500, maxLookback: 5_000, limit: 7 },
      )
      if (recent.complete || recent.logs.length > 0) setActivity(parseActivity(recent.logs).slice(0, 7))
    } catch (error) {
      reportDiagnostic("activity-rpc", error)
      // Activity metadata is best-effort and must not invalidate live pool state.
    }
  }, [activeMarket])

  const refresh = useCallback(async (includeActivity = false) => {
    setReadError(undefined)
    try {
      if (!activeMarket.drawScopedEnrollment) {
        throw new Error("This generated deployment manifest uses the superseded draw ABI. Deploy and bind the continuous-draw contracts before using this market.")
      }
      const snapshot = await retryTransient(() => withReadProvider(async (readProvider) => {
        const pool = new Contract(activeMarket.poolAddress, POOL_ABI, readProvider)
        const asset = new Contract(activeMarket.assetAddress, ASSET_ABI, readProvider)
        const underlying = new Contract(activeMarket.underlyingAddress, UNDERLYING_ABI, readProvider)
        const liquidityVault = new Contract(activeMarket.liquidityVaultAddress, LIQUIDITY_VAULT_ABI, readProvider)
        const [currentDrawIdRaw, actionableCountRaw] = await Promise.all([
          pool.currentDrawId(),
          pool.actionableDrawCount(),
        ])
        const currentDrawId = Number(currentDrawIdRaw)
        const actionableDrawCount = Number(actionableCountRaw)
        const pageOffset = historicalOffset < actionableDrawCount ? historicalOffset : 0
        const historicalIds = Array.from(await pool.actionableDrawIds(pageOffset, HISTORICAL_PAGE_SIZE), (id: bigint) => Number(id))
        const [currentMetadata, ...historicalMetadata] = await Promise.all([
          pool.drawMetadata(currentDrawId),
          ...historicalIds.map((id) => pool.drawMetadata(id)),
        ])
        const now = Math.floor(Date.now() / 1000)
        const currentDraw = toDrawState(currentDrawId, currentMetadata, now)
        const historicalDraws = historicalMetadata
          .map((metadata, index) => toDrawState(historicalIds[index], metadata, now))
          .filter((draw) => draw.scheduledOpen > 0)

        if (account) {
          const entered = await Promise.all([
            pool.isEntered(currentDrawId, account),
            ...historicalDraws.map((draw) => pool.isEntered(draw.drawId, account)),
          ])
          currentDraw.isEntered = Boolean(entered[0])
          historicalDraws.forEach((draw, index) => { draw.isEntered = Boolean(entered[index + 1]) })
        }
        const claimDraw = [...historicalDraws]
          .filter((draw) => draw.claimable && (!account || draw.isEntered))
          .sort((a, b) => b.drawId - a.drawId)[0]
        const privateState = account
          ? await Promise.all([
              pool.principalOf(account),
              asset.confidentialBalanceOf(account),
              underlying.balanceOf(account),
              asset.isOperator(account, activeMarket.poolAddress),
              liquidityVault.totalPrincipal(),
            ])
          : undefined
        return {
          currentDraw,
          historicalDraws,
          claimDraw,
          actionableDrawCount,
          historicalOffset: pageOffset,
          privateState,
        }
      }), { attempts: 2 })

      if (claimDrawIdRef.current !== snapshot.claimDraw?.drawId) {
        claimDrawIdRef.current = snapshot.claimDraw?.drawId
        setPrize(undefined)
        setPrizeDrawId(undefined)
        setPrizeHandle(undefined)
      }
      setPoolState({
        currentDraw: snapshot.currentDraw,
        historicalDraws: snapshot.historicalDraws,
        claimDraw: snapshot.claimDraw,
        actionableDrawCount: snapshot.actionableDrawCount,
        historicalOffset: snapshot.historicalOffset,
        deploymentBlock: cachedDeploymentBlocks[activeMarket.id],
      })

      if (snapshot.privateState) {
        const [nextPrincipalHandle, nextWalletHandle, nextUnderlyingBalance, operator, nextVaultTvlHandle] = snapshot.privateState
        setVaultTvlHandle(String(nextVaultTvlHandle))
        setPrincipalHandle(String(nextPrincipalHandle))
        setWalletHandle(String(nextWalletHandle))
        setUnderlyingBalance(BigInt(nextUnderlyingBalance))
        setIsOperator(Boolean(operator))
        setIsEntered(activeMarket.drawScopedEnrollment ? snapshot.currentDraw.isEntered : undefined)
      } else {
        setPrincipalHandle(undefined)
        setWalletHandle(undefined)
        setVaultTvlHandle(undefined)
        setUnderlyingBalance(undefined)
        setIsOperator(false)
        setIsEntered(undefined)
      }

      if (includeActivity) await refreshActivity()
    } catch (error) {
      reportDiagnostic("pool-read", error)
      setReadError(toUserError(error, "Could not read the Sepolia deployment."))
    } finally {
      setLoading(false)
    }
  }, [account, activeMarket, historicalOffset, refreshActivity])

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
    setPrizeDrawId(undefined)
    setPrizeHandle(undefined)
    setDecryptInputs([])
    setDecryptTarget(undefined)
    setIsEntered(undefined)
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
    setOperation({ stage: "error", error: toUserError(decryptQuery.error, "Threshold decryption failed.") })
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
      setOperation({ stage: "error", error: toUserError(error, "Wallet connection was cancelled.") })
    }
  }, [connectAsync, connectors, walletAvailable])

  const switchNetwork = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: CHAIN_ID })
    } catch (error) {
      setOperation({ stage: "error", error: toUserError(error, "Switch to Sepolia in your wallet.") })
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
      setOperation({ kind: "permit", stage: "error", error: toUserError(error, "Could not authorize private reads.") })
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
      setOperation({ stage: "error", error: toUserError(error, "Threshold decryption failed.") })
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
      setOperation({ kind: "operator", stage: "error", error: toUserError(error, "Operator approval failed.") })
    }
  }, [activeMarket, browserProvider, correctChain, refresh])

  const enterDraw = useCallback(async () => {
    if (!account || !browserProvider || !correctChain || !activeMarket.drawScopedEnrollment || poolState.currentDraw.status !== 0 || isEntered) return
    try {
      setOperation({ kind: "entry", stage: "signature", title: `Enter draw #${poolState.currentDraw.drawId}` })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.enterDraw()
      setOperation({ kind: "entry", stage: "pending", title: "Draw entry pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      setIsEntered(true)
      setOperation({ kind: "entry", stage: "confirmed", title: `Entered draw #${poolState.currentDraw.drawId}`, hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "entry", stage: "error", error: toUserError(error, "Could not enter this draw.") })
    }
  }, [account, activeMarket, browserProvider, correctChain, isEntered, poolState.currentDraw.drawId, poolState.currentDraw.status, refresh])

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
      setOperation({ kind, stage: "error", error: toUserError(error, `${kind === "deposit" ? "Deposit" : "Withdrawal"} failed.`) })
      throw error
    }
  }, [account, activeMarket, browserProvider, correctChain, isOperator, principal, refresh, walletBalance, zamaEncrypt])

  const previewPrize = useCallback(async (requestedDrawId?: number) => {
    const targetDraw = requestedDrawId === undefined
      ? poolState.claimDraw
      : poolState.historicalDraws.find((draw) => draw.drawId === requestedDrawId)
    if (!account || !browserProvider || !correctChain || !targetDraw?.claimable || !targetDraw.isEntered) return
    try {
      setPrize(undefined)
      setPrizeDrawId(targetDraw.drawId)
      setOperation({ kind: "preview", stage: "signature", title: `Create draw #${targetDraw.drawId} prize preview` })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.previewPrize(targetDraw.drawId)
      setOperation({ kind: "preview", stage: "pending", title: "Computing prize-or-zero", hash: tx.hash })
      await waitForSuccess(tx.wait())
      const handle = String(await pool.prizePreviewOf(targetDraw.drawId, account))
      if (!permitReady) {
        setOperation({ kind: "preview", stage: "confirmed", title: "Preview ready — authorize a private session to reveal", hash: tx.hash })
        return
      }
      setPrizeHandle(handle as `0x${string}`)
      setDecryptTarget("prize")
      setDecryptInputs([{ encryptedValue: handle as `0x${string}`, contractAddress: activeMarket.poolAddress }])
      setOperation({ kind: "preview", stage: "preparing", title: "Decrypting private result", hash: tx.hash })
    } catch (error) {
      setOperation({ kind: "preview", stage: "error", error: toUserError(error, "Prize preview failed.") })
    }
  }, [account, activeMarket.poolAddress, browserProvider, correctChain, permitReady, poolState.claimDraw, poolState.historicalDraws])

  const claimPrize = useCallback(async (requestedDrawId?: number) => {
    const targetDrawId = requestedDrawId ?? poolState.claimDraw?.drawId
    if (!browserProvider || !correctChain || targetDrawId === undefined || prizeDrawId !== targetDrawId || prize === undefined || prize === 0n) return
    try {
      setOperation({ kind: "claim", stage: "signature", title: "Confirm private prize claim" })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.claimPrize(targetDrawId)
      setOperation({ kind: "claim", stage: "pending", title: "Prize claim pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      setPrize(0n)
      setWalletBalance(undefined)
      setOperation({ kind: "claim", stage: "confirmed", title: "Prize transferred confidentially", hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "claim", stage: "error", error: toUserError(error, "Prize claim failed.") })
    }
  }, [activeMarket.poolAddress, browserProvider, correctChain, poolState.claimDraw?.drawId, prize, prizeDrawId, refresh])

  const advanceSelection = useCallback(async (drawId: number) => {
    if (!browserProvider || !correctChain) return
    const draw = poolState.historicalDraws.find((candidate) => candidate.drawId === drawId)
    if (!draw || draw.status !== 1) return
    try {
      const remaining = Math.max(0, draw.participantCount - draw.scanCursor)
      const batchSize = Math.min(12, remaining)
      if (batchSize === 0) return
      setOperation({ kind: "lifecycle", stage: "signature", title: `Advance draw #${drawId} selection` })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.continueSelection(drawId, batchSize)
      setOperation({ kind: "lifecycle", stage: "pending", title: "Historical selection pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      setOperation({ kind: "lifecycle", stage: "confirmed", title: `Draw #${drawId} selection advanced`, hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "lifecycle", stage: "error", error: toUserError(error, "Could not advance historical selection.") })
    }
  }, [activeMarket.poolAddress, browserProvider, correctChain, poolState.historicalDraws, refresh])

  const sweepPrize = useCallback(async (drawId: number) => {
    if (!browserProvider || !correctChain) return
    try {
      setOperation({ kind: "lifecycle", stage: "signature", title: `Sweep draw #${drawId}` })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = await pool.sweepExpiredPrize(drawId)
      setOperation({ kind: "lifecycle", stage: "pending", title: "Encrypted prize sweep pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      setOperation({ kind: "lifecycle", stage: "confirmed", title: `Draw #${drawId} swept`, hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "lifecycle", stage: "error", error: toUserError(error, "Could not sweep the expired prize.") })
    }
  }, [activeMarket.poolAddress, browserProvider, correctChain, refresh])

  const advanceDraw = useCallback(async () => {
    if (!browserProvider || !correctChain) return
    const lifecycle = deriveDrawLifecycle(poolState.currentDraw, poolState.historicalDraws, Math.floor(Date.now() / 1000))
    if (!lifecycle.ready) {
      setOperation({ kind: "lifecycle", stage: "error", error: lifecycle.reason })
      return
    }

    try {
      const title = lifecycle.kind === "close"
        ? "Confirm draw close"
        : lifecycle.kind === "continue"
          ? `Advance ${lifecycle.batchSize} selection accounts`
          : lifecycle.kind === "sweep" ? `Sweep draw #${lifecycle.drawId}` : "No draw action"
      setOperation({ kind: "lifecycle", stage: "signature", title })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(activeMarket.poolAddress, POOL_ABI, signer)
      const tx = lifecycle.kind === "close"
        ? await pool.closeDraw()
        : lifecycle.kind === "continue"
          ? await pool.continueSelection(lifecycle.drawId, lifecycle.batchSize)
          : await pool.sweepExpiredPrize(lifecycle.drawId)
      setOperation({ kind: "lifecycle", stage: "pending", title: "Draw lifecycle transaction pending", hash: tx.hash })
      const receipt = await waitForSuccess(tx.wait())
      recordActivityFromReceipt(receipt, setActivity)
      const confirmedTitle = lifecycle.kind === "close"
        ? "Winner selection started"
        : lifecycle.kind === "continue"
          ? "Winner selection advanced"
          : "Expired prize swept"
      setOperation({ kind: "lifecycle", stage: "confirmed", title: confirmedTitle, hash: tx.hash })
      await refresh(true)
    } catch (error) {
      reportDiagnostic("draw-lifecycle", error)
      setOperation({ kind: "lifecycle", stage: "error", error: toUserError(error, "Could not advance the draw. Refresh and retry.") })
    }
  }, [activeMarket.poolAddress, browserProvider, correctChain, poolState, refresh])

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
      setOperation({ kind: "fund", stage: "error", error: toUserError(error, "Testnet funding failed.") })
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
    setPrizeDrawId(undefined)
    setIsEntered(undefined)
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
    prizeDrawId,
    isOperator,
    isEntered,
    permitReady,
    relayerStatus,
    loading,
    readError,
    operation,
    workflowStep,
    connect,
    selectMarket,
    disconnect,
    switchNetwork,
    authorizeReads,
    revealPosition,
    approveOperator,
    enterDraw,
    transact,
    previewPrize,
    claimPrize,
    advanceSelection,
    sweepPrize,
    setHistoricalOffset,
    advanceDraw,
    fundTestnet,
    refresh,
    clearOperation,
  }), [
    account, activeMarket, walletAvailable, walletChainId, correctChain, poolState, activity, principal, walletBalance, underlyingBalance, vaultTvl, browserProvider,
    prize, prizeDrawId, isOperator, isEntered, permitReady, relayerStatus, loading, readError, operation, workflowStep, connect, disconnect,
    switchNetwork, authorizeReads, revealPosition, approveOperator, enterDraw, selectMarket, transact, previewPrize, claimPrize, advanceSelection, sweepPrize, setHistoricalOffset, advanceDraw, fundTestnet, refresh,
    clearOperation,
  ])
}

export type ConfidentialPoolTogetherModel = ReturnType<typeof useConfidentialPoolTogether>

type DrawMetadataResult = {
  scheduledOpen: bigint
  scheduledClose: bigint
  claimableAt: bigint
  claimExpiresAt: bigint
  participantCount: bigint
  scanCursor: bigint
  status: bigint
}

function toDrawState(drawId: number, metadata: DrawMetadataResult, now: number): DrawState {
  const status = Number(metadata.status)
  const claimExpiresAt = Number(metadata.claimExpiresAt)
  return {
    drawId,
    status,
    statusLabel: DRAW_STATUSES[status] ?? "Unknown",
    scheduledOpen: Number(metadata.scheduledOpen),
    scheduledClose: Number(metadata.scheduledClose),
    claimableAt: Number(metadata.claimableAt),
    claimExpiresAt,
    participantCount: Number(metadata.participantCount),
    scanCursor: Number(metadata.scanCursor),
    claimable: status === 2 && claimExpiresAt > now,
  }
}

function parseActivity(logs: Log[]): ActivityItem[] {
  const labels: Record<string, string> = {
    DepositRecorded: "Encrypted deposit accepted",
    DrawEntered: "Saver entered the draw",
    WithdrawalRecorded: "Principal withdrawal recorded",
    PrizeFunded: "Yield entered the prize reserve",
    DrawOpened: "New private draw opened",
    DrawFinalized: "Entry period finalized",
    SelectionProgress: "Encrypted winner scan advanced",
    DrawClaimable: "Private prize claims enabled",
    DrawExpired: "Private claim window expired",
    PrizeSwept: "Encrypted prize reserve swept forward",
    PrizeClaimAttempted: "Prize-or-zero claim submitted",
  }
  return logs.flatMap((log) => {
    try {
      const parsed = poolInterface.parseLog(log)
      if (!parsed || !labels[parsed.name]) return []
      const rawDrawId = parsed.args.drawId ?? parsed.args.sourceDrawId ?? parsed.args.targetDrawId
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

async function withReadProvider<T>(operation: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let offset = 0; offset < readProviders.length; offset += 1) {
    const index = (preferredReadProvider + offset) % readProviders.length
    try {
      const result = await operation(readProviders[index])
      preferredReadProvider = index
      return result
    } catch (error) {
      lastError = error
      if (!isTransientProviderError(error)) throw error
      reportDiagnostic(`rpc-fallback-${index + 1}`, error)
    }
  }
  throw lastError
}
