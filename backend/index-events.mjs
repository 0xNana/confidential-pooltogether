import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { Contract, Interface, JsonRpcProvider } from "ethers"

const backendDirectory = path.dirname(fileURLToPath(import.meta.url))
const contractsDirectory = path.join(backendDirectory, "..", "contracts")
const deployment = JSON.parse(fs.readFileSync(path.join(contractsDirectory, "deployments", "sepolia.json"), "utf8"))
const artifactPath = path.join(contractsDirectory, "artifacts", "src", "ConfidentialPrizePool.sol", "ConfidentialPrizePool.json")
if (!fs.existsSync(artifactPath)) throw new Error("Contract artifact missing. Run npm run contracts:compile first.")
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"))

const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required")
if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

const chainId = Number(deployment.chainId)
const contractAddress = deployment.pool.toLowerCase()
const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const contractInterface = new Interface(artifact.abi)
const pool = new Contract(deployment.pool, artifact.abi, provider)
const labels = {
  DepositRecorded: "Encrypted deposit accepted",
  WithdrawalRecorded: "Principal withdrawal recorded",
  PrizeFunded: "Yield entered the prize reserve",
  DrawOpened: "New private draw opened",
  DrawEntered: "Account entered the private draw",
  DrawFinalized: "Entry period finalized",
  SelectionProgress: "Encrypted winner scan advanced",
  DrawClaimable: "Private prize claims enabled",
  DrawExpired: "Private claim window expired",
  PrizeSwept: "Encrypted prize reserve swept forward",
  PrizeClaimAttempted: "Prize-or-zero claim submitted",
}

const { data: state, error: stateError } = await supabase
  .from("pool_event_indexer_state")
  .select("last_finalized_block")
  .eq("chain_id", chainId)
  .eq("contract_address", contractAddress)
  .maybeSingle()
if (stateError) throw stateError

const deploymentReceipt = await provider.getTransactionReceipt(deployment.transactionHash)
if (!deploymentReceipt) throw new Error("Deployment transaction receipt is unavailable")
const latestBlock = await provider.getBlockNumber()
const finalizedBlock = latestBlock - 3
let fromBlock = state ? Number(state.last_finalized_block) + 1 : deploymentReceipt.blockNumber
const chunkSize = 250
let indexed = 0

while (fromBlock <= finalizedBlock) {
  const toBlock = Math.min(finalizedBlock, fromBlock + chunkSize - 1)
  const logs = await getLogsWithRetry(fromBlock, toBlock)
  const rows = logs.flatMap((log) => serializeLog(log))

  if (rows.length > 0) {
    const { error } = await supabase.from("pool_events").upsert(rows, {
      onConflict: "chain_id,contract_address,transaction_hash,log_index",
      ignoreDuplicates: true,
    })
    if (error) throw error
    const drawIds = new Set(rows.flatMap((row) => [row.draw_id, row.metadata.target_draw_id]).filter(Boolean))
    const drawRows = await Promise.all([...drawIds].map((drawId) => serializeDraw(drawId)))
    const { error: drawError } = await supabase.from("pool_draws").upsert(drawRows, {
      onConflict: "chain_id,contract_address,draw_id",
    })
    if (drawError) throw drawError
    indexed += rows.length
  }

  const { error: checkpointError } = await supabase.from("pool_event_indexer_state").upsert({
    chain_id: chainId,
    contract_address: contractAddress,
    last_finalized_block: toBlock,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chain_id,contract_address" })
  if (checkpointError) throw checkpointError
  fromBlock = toBlock + 1
}

await syncCurrentReadModel()

console.log(JSON.stringify({ chainId, contract: deployment.pool, finalizedBlock, indexed }, null, 2))

async function getLogsWithRetry(fromBlock, toBlock) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await provider.getLogs({ address: deployment.pool, fromBlock, toBlock })
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  throw lastError
}

function serializeLog(log) {
  let parsed
  try {
    parsed = contractInterface.parseLog(log)
  } catch {
    return []
  }
  if (!parsed || !labels[parsed.name]) return []

  const drawId = parsed.args.drawId ?? parsed.args.sourceDrawId ?? parsed.args.targetDrawId
  return [{
    chain_id: chainId,
    contract_address: contractAddress,
    transaction_hash: log.transactionHash.toLowerCase(),
    log_index: log.index,
    block_number: log.blockNumber,
    event_name: parsed.name,
    draw_id: drawId === undefined ? null : Number(drawId),
    label: labels[parsed.name],
    metadata: publicMetadata(parsed),
  }]
}

function publicMetadata(parsed) {
  if (parsed.name === "DrawOpened") {
    return { scheduled_open: Number(parsed.args.scheduledOpen), scheduled_close: Number(parsed.args.scheduledClose) }
  }
  if (parsed.name === "DrawClaimable") {
    return { claimable_at: Number(parsed.args.claimableAt), claim_expires_at: Number(parsed.args.claimExpiresAt) }
  }
  if (parsed.name === "DrawFinalized") return { participant_count: Number(parsed.args.participantCount) }
  if (parsed.name === "SelectionProgress") {
    return { cursor: Number(parsed.args.cursor), participant_count: Number(parsed.args.participantCount) }
  }
  if (parsed.name === "PrizeSwept") return { target_draw_id: Number(parsed.args.targetDrawId) }
  return {}
}

async function serializeDraw(drawId) {
  const metadata = await pool.drawMetadata(drawId)
  return {
    chain_id: chainId,
    contract_address: contractAddress,
    draw_id: drawId,
    scheduled_open: Number(metadata.scheduledOpen),
    scheduled_close: Number(metadata.scheduledClose),
    claimable_at: Number(metadata.claimableAt) || null,
    claim_expires_at: Number(metadata.claimExpiresAt) || null,
    participant_count: Number(metadata.participantCount),
    scan_cursor: Number(metadata.scanCursor),
    status: Number(metadata.status),
    updated_at: new Date().toISOString(),
  }
}

async function syncCurrentReadModel() {
  const [currentDrawIdRaw, actionableCountRaw] = await Promise.all([
    pool.currentDrawId(),
    pool.actionableDrawCount(),
  ])
  const ids = new Set([Number(currentDrawIdRaw)])
  const count = Number(actionableCountRaw)
  for (let offset = 0; offset < count; offset += 32) {
    const page = await pool.actionableDrawIds(offset, 32)
    for (const id of page) ids.add(Number(id))
  }
  const rows = await Promise.all([...ids].map((drawId) => serializeDraw(drawId)))
  const { error } = await supabase.from("pool_draws").upsert(rows, {
    onConflict: "chain_id,contract_address,draw_id",
  })
  if (error) throw error
}
