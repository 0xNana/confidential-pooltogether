import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
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
  ASSET_ADDRESS,
  CHAIN_HEX,
  CHAIN_ID,
  DEPLOYMENT_TX,
  DRAW_PHASES,
  POOL_ABI,
  POOL_ADDRESS,
  SEPOLIA_RPC_URL,
  UNDERLYING_ABI,
  UNDERLYING_ADDRESS,
  type Address,
} from "../lib/contracts"
import { fetchRecentLogs } from "../lib/rpc-logs"
import {
  fetchIndexedActivity,
  subscribeToIndexedActivity,
  type PublicActivityItem,
} from "../lib/supabase-events"
import {
  clearSessionPermit,
  createSessionPermit,
  decryptHandles,
  encryptPoolAmount,
  getFhevmInstance,
  hasSessionPermit,
} from "../lib/fhevm-client"
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
let cachedDeploymentBlock: number | undefined
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
  const [account, setAccount] = useState<Address>()
  const [walletChainId, setWalletChainId] = useState<number>()
  const [browserProvider, setBrowserProvider] = useState<BrowserProvider>()
  const [poolState, setPoolState] = useState(initialPoolState)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [principalHandle, setPrincipalHandle] = useState<string>()
  const [walletHandle, setWalletHandle] = useState<string>()
  const [principal, setPrincipal] = useState<bigint>()
  const [walletBalance, setWalletBalance] = useState<bigint>()
  const [prize, setPrize] = useState<bigint>()
  const [isOperator, setIsOperator] = useState(false)
  const [permitReady, setPermitReady] = useState(false)
  const [relayerStatus, setRelayerStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState<string>()
  const [operation, setOperation] = useState<OperationState>({ stage: "idle" })

  const correctChain = walletChainId === CHAIN_ID
  const walletAvailable = typeof window !== "undefined" && Boolean(window.ethereum)

  const refreshActivity = useCallback(async () => {
    try {
      const indexed = await fetchIndexedActivity(7)
      if (indexed !== undefined) {
        setActivity(indexed)
        return
      }
    } catch {
      // A configured index may be temporarily unavailable; use a bounded RPC fallback.
    }

    try {
      if (cachedDeploymentBlock === undefined) {
        const deployReceipt = await readProvider.getTransactionReceipt(DEPLOYMENT_TX)
        cachedDeploymentBlock = deployReceipt?.blockNumber
        if (cachedDeploymentBlock !== undefined) {
          setPoolState((previous) => ({ ...previous, deploymentBlock: cachedDeploymentBlock }))
        }
      }

      if (cachedDeploymentBlock === undefined) return
      const currentBlock = await readProvider.getBlockNumber()
      const recent = await fetchRecentLogs(
        (range) => readProvider.getLogs({ address: POOL_ADDRESS, ...range }),
        cachedDeploymentBlock,
        currentBlock,
        { chunkSize: 500, maxLookback: 5_000, limit: 7 },
      )
      if (recent.complete || recent.logs.length > 0) setActivity(parseActivity(recent.logs).slice(0, 7))
    } catch {
      // Activity metadata is best-effort and must not invalidate live pool state.
    }
  }, [])

  const refresh = useCallback(async (includeActivity = false) => {
    setReadError(undefined)
    try {
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, readProvider)
      const asset = new Contract(ASSET_ADDRESS, ASSET_ABI, readProvider)
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
        deploymentBlock: cachedDeploymentBlock,
      })

      if (account) {
        const [nextPrincipalHandle, nextWalletHandle, operator] = await Promise.all([
          pool.principalOf(account),
          asset.confidentialBalanceOf(account),
          asset.isOperator(account, POOL_ADDRESS),
        ])
        setPrincipalHandle(String(nextPrincipalHandle))
        setWalletHandle(String(nextWalletHandle))
        setIsOperator(Boolean(operator))
      } else {
        setPrincipalHandle(undefined)
        setWalletHandle(undefined)
        setIsOperator(false)
      }

      if (includeActivity) await refreshActivity()
    } catch (error) {
      setReadError(errorMessage(error, "Could not read the Sepolia deployment."))
    } finally {
      setLoading(false)
    }
  }, [account, refreshActivity])

  useEffect(() => {
    void refresh(true)
    const interval = window.setInterval(() => void refresh(), 20_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    let disposed = false
    let unsubscribe: () => void = () => {}
    void subscribeToIndexedActivity(() => void refreshActivity()).then((cleanup) => {
      if (disposed) cleanup()
      else unsubscribe = cleanup
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [refreshActivity])

  useEffect(() => {
    if (!window.ethereum) return
    const provider = window.ethereum
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined
      const next = accounts?.[0] as Address | undefined
      setAccount(next)
      setPrincipal(undefined)
      setWalletBalance(undefined)
      setPrize(undefined)
      setPermitReady(hasSessionPermit(next))
    }
    const onChain = (...args: unknown[]) => setWalletChainId(Number(args[0]))
    provider.on?.("accountsChanged", onAccounts)
    provider.on?.("chainChanged", onChain)
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts)
      provider.removeListener?.("chainChanged", onChain)
    }
  }, [])

  useEffect(() => {
    if (!account || !correctChain || relayerStatus !== "idle") return
    setRelayerStatus("loading")
    void getFhevmInstance()
      .then(() => setRelayerStatus("ready"))
      .catch(() => setRelayerStatus("error"))
  }, [account, correctChain, relayerStatus])

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setOperation({ stage: "error", error: "Install an EIP-1193 wallet such as MetaMask or Rabby." })
      return
    }
    try {
      setOperation({ stage: "preparing", title: "Connecting wallet" })
      const provider = new BrowserProvider(window.ethereum as unknown as Eip1193Provider)
      await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress() as Address
      const network = await provider.getNetwork()
      setBrowserProvider(provider)
      setAccount(address)
      setWalletChainId(Number(network.chainId))
      setPermitReady(hasSessionPermit(address))
      setOperation({ stage: "idle" })
    } catch (error) {
      setOperation({ stage: "error", error: errorMessage(error, "Wallet connection was cancelled.") })
    }
  }, [])

  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] })
      setWalletChainId(CHAIN_ID)
    } catch (error) {
      setOperation({ stage: "error", error: errorMessage(error, "Switch to Sepolia in your wallet.") })
    }
  }, [])

  const authorizeReads = useCallback(async () => {
    if (!account || !browserProvider || !correctChain) return
    try {
      setOperation({ kind: "permit", stage: "preparing", title: "Preparing private session" })
      const signer = await browserProvider.getSigner()
      setOperation({ kind: "permit", stage: "signature", title: "Authorize confidential reads" })
      await createSessionPermit(signer, account, [POOL_ADDRESS, ASSET_ADDRESS])
      setPermitReady(true)
      setOperation({ kind: "permit", stage: "confirmed", title: "Private session authorized" })
    } catch (error) {
      setOperation({ kind: "permit", stage: "error", error: errorMessage(error, "Could not authorize private reads.") })
    }
  }, [account, browserProvider, correctChain])

  const revealPosition = useCallback(async () => {
    if (!account || !permitReady) return
    try {
      setOperation({ stage: "preparing", title: "Requesting threshold decryption" })
      const inputs: Array<{ handle: string; contractAddress: Address }> = []
      if (principalHandle && principalHandle !== ZeroHash) inputs.push({ handle: principalHandle, contractAddress: POOL_ADDRESS })
      if (walletHandle && walletHandle !== ZeroHash) inputs.push({ handle: walletHandle, contractAddress: ASSET_ADDRESS })
      const clear = inputs.length ? await decryptHandles(account, inputs) : {}
      const principalKey = principalHandle as `0x${string}` | undefined
      const walletKey = walletHandle as `0x${string}` | undefined
      setPrincipal(principalKey && principalKey !== ZeroHash ? BigInt(clear[principalKey] ?? 0) : 0n)
      setWalletBalance(walletKey && walletKey !== ZeroHash ? BigInt(clear[walletKey] ?? 0) : 0n)
      setOperation({ stage: "confirmed", title: "Confidential values revealed locally" })
    } catch (error) {
      setOperation({ stage: "error", error: errorMessage(error, "Threshold decryption failed.") })
    }
  }, [account, permitReady, principalHandle, walletHandle])

  const approveOperator = useCallback(async () => {
    if (!browserProvider || !correctChain) return
    try {
      setOperation({ kind: "operator", stage: "signature", title: "Approve 30-day pool access" })
      const signer = await browserProvider.getSigner()
      const asset = new Contract(ASSET_ADDRESS, ASSET_ABI, signer)
      const until = Math.floor(Date.now() / 1000) + 30 * 86_400
      const tx = await asset.setOperator(POOL_ADDRESS, until)
      setOperation({ kind: "operator", stage: "pending", title: "Recording ERC-7984 operator", hash: tx.hash })
      await waitForSuccess(tx.wait())
      setIsOperator(true)
      setOperation({ kind: "operator", stage: "confirmed", title: "Pool access approved", hash: tx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "operator", stage: "error", error: errorMessage(error, "Operator approval failed.") })
    }
  }, [browserProvider, correctChain, refresh])

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
      setOperation({ kind, stage: "preparing", title: "Initializing Zama relayer" })
      await getFhevmInstance()
      setOperation({ kind, stage: "encrypting", title: "Encrypting amount and generating proof" })
      const encrypted = await encryptPoolAmount(amount, account)
      setOperation({ kind, stage: "signature", title: `Confirm ${kind} in wallet` })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, signer)
      const tx = await pool[kind](encrypted.handle, encrypted.inputProof)
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
  }, [account, browserProvider, correctChain, isOperator, principal, refresh, walletBalance])

  const previewPrize = useCallback(async () => {
    if (!account || !browserProvider || !correctChain || !poolState.claimable) return
    try {
      setOperation({ kind: "preview", stage: "signature", title: "Create encrypted prize preview" })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, signer)
      const tx = await pool.previewPrize(poolState.drawId)
      setOperation({ kind: "preview", stage: "pending", title: "Computing prize-or-zero", hash: tx.hash })
      await waitForSuccess(tx.wait())
      const handle = String(await pool.prizePreviewOf(poolState.drawId, account))
      if (!permitReady) {
        setOperation({ kind: "preview", stage: "confirmed", title: "Preview ready — authorize a private session to reveal", hash: tx.hash })
        return
      }
      const clear = await decryptHandles(account, [{ handle, contractAddress: POOL_ADDRESS }])
      setPrize(BigInt(clear[handle as `0x${string}`] ?? 0))
      setOperation({ kind: "preview", stage: "confirmed", title: "Prize result revealed locally", hash: tx.hash })
    } catch (error) {
      setOperation({ kind: "preview", stage: "error", error: errorMessage(error, "Prize preview failed.") })
    }
  }, [account, browserProvider, correctChain, permitReady, poolState.claimable, poolState.drawId])

  const claimPrize = useCallback(async () => {
    if (!browserProvider || !correctChain || prize === undefined || prize === 0n) return
    try {
      setOperation({ kind: "claim", stage: "signature", title: "Confirm private prize claim" })
      const signer = await browserProvider.getSigner()
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, signer)
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
  }, [browserProvider, correctChain, poolState.drawId, prize, refresh])

  const fundTestnet = useCallback(async () => {
    if (!account || !browserProvider || !correctChain) return
    const amount = parseTokenAmount("1000")
    try {
      const signer = await browserProvider.getSigner()
      const underlying = new Contract(UNDERLYING_ADDRESS, UNDERLYING_ABI, signer)
      const wrapper = new Contract(ASSET_ADDRESS, ASSET_ABI, signer)

      setOperation({ kind: "fund", stage: "signature", title: "Mint 1,000 official test USDT" })
      const mintTx = await underlying.mint(account, amount)
      setOperation({ kind: "fund", stage: "pending", title: "Minting test USDT", hash: mintTx.hash })
      await waitForSuccess(mintTx.wait())

      const allowance = BigInt(await underlying.allowance(account, ASSET_ADDRESS))
      if (allowance < amount) {
        setOperation({ kind: "fund", stage: "signature", title: "Approve the official cUSDT wrapper" })
        const approveTx = await underlying.approve(ASSET_ADDRESS, amount)
        setOperation({ kind: "fund", stage: "pending", title: "Approving test USDT", hash: approveTx.hash })
        await waitForSuccess(approveTx.wait())
      }

      setOperation({ kind: "fund", stage: "signature", title: "Shield test USDT into cUSDT" })
      const wrapTx = await wrapper.wrap(account, amount)
      setOperation({ kind: "fund", stage: "pending", title: "Creating confidential cUSDT", hash: wrapTx.hash })
      await waitForSuccess(wrapTx.wait())
      setWalletBalance(undefined)
      setOperation({ kind: "fund", stage: "confirmed", title: "1,000 official test cUSDT ready", hash: wrapTx.hash })
      await refresh(true)
    } catch (error) {
      setOperation({ kind: "fund", stage: "error", error: errorMessage(error, "Testnet funding failed.") })
    }
  }, [account, browserProvider, correctChain, refresh])

  const disconnect = useCallback(() => {
    clearSessionPermit(account)
    setAccount(undefined)
    setBrowserProvider(undefined)
    setWalletChainId(undefined)
    setPermitReady(false)
    setPrincipal(undefined)
    setWalletBalance(undefined)
    setPrize(undefined)
    setOperation({ stage: "idle" })
  }, [account])

  const clearOperation = useCallback(() => setOperation({ stage: "idle" }), [])

  return useMemo(() => ({
    account,
    walletAvailable,
    walletChainId,
    correctChain,
    poolState,
    activity,
    principal,
    walletBalance,
    prize,
    isOperator,
    permitReady,
    relayerStatus,
    loading,
    readError,
    operation,
    connect,
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
    account, walletAvailable, walletChainId, correctChain, poolState, activity, principal, walletBalance,
    prize, isOperator, permitReady, relayerStatus, loading, readError, operation, connect, disconnect,
    switchNetwork, authorizeReads, revealPosition, approveOperator, transact, previewPrize, claimPrize, fundTestnet, refresh,
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
