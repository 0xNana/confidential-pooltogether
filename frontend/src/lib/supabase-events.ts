import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { CHAIN_ID, type Address } from "./contracts"

export type PublicActivityItem = {
  id: string
  event: string
  label: string
  blockNumber: number
  drawId?: number
  transactionHash: string
}

type PoolEventRow = {
  id: number
  event_name: string
  label: string
  block_number: number
  draw_id: number | null
  transaction_hash: string
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
let clientPromise: Promise<SupabaseClient> | undefined

export function hasEventBackend() {
  return Boolean(supabaseUrl && supabasePublishableKey)
}

export async function fetchIndexedActivity(poolAddress: Address, limit = 7): Promise<PublicActivityItem[] | undefined> {
  if (!hasEventBackend()) return undefined
  const client = await getClient()
  const normalizedPoolAddress = poolAddress.toLowerCase()
  const { data, error } = await client
    .from("pool_events")
    .select("id,event_name,label,block_number,draw_id,transaction_hash")
    .eq("chain_id", CHAIN_ID)
    .eq("contract_address", normalizedPoolAddress)
    .order("block_number", { ascending: false })
    .order("log_index", { ascending: false })
    .limit(Math.max(1, limit))

  if (error) throw error
  return (data as PoolEventRow[]).map((row) => ({
    id: `indexed-${row.id}`,
    event: row.event_name,
    label: row.label,
    blockNumber: Number(row.block_number),
    drawId: row.draw_id === null ? undefined : Number(row.draw_id),
    transactionHash: row.transaction_hash,
  }))
}

export async function subscribeToIndexedActivity(poolAddress: Address, onInsert: () => void): Promise<() => void> {
  if (!hasEventBackend()) return () => undefined
  const client = await getClient()
  const normalizedPoolAddress = poolAddress.toLowerCase()
  const channel: RealtimeChannel = client
    .channel(`pool-events-${CHAIN_ID}-${normalizedPoolAddress}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "pool_events" }, (payload) => {
      const row = payload.new as { chain_id?: number; contract_address?: string }
      if (Number(row.chain_id) === CHAIN_ID && row.contract_address === normalizedPoolAddress) onInsert()
    })
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}

async function getClient() {
  if (!supabaseUrl || !supabasePublishableKey) throw new Error("Supabase event backend is not configured.")
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(
      supabaseUrl,
      supabasePublishableKey,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    ))
  }
  return clientPromise
}
