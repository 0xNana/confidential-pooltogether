export type RpcRequest = {
  method: string
  params?: readonly unknown[]
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type JsonRpcError = { code: number; message: string; data?: unknown }
type JsonRpcResponse = { result?: unknown; error?: JsonRpcError }

class RpcExecutionError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(error: JsonRpcError) {
    super(error.message)
    this.name = "RpcExecutionError"
    this.code = error.code
    this.data = error.data
  }
}

export function createFailoverRpcRequest(urls: readonly string[], fetchFn: FetchLike = fetch): (request: RpcRequest) => Promise<unknown> {
  if (urls.length === 0) throw new Error("At least one Sepolia RPC URL is required.")
  let preferredIndex = 0
  let requestId = 0

  return async ({ method, params = [] }) => {
    let lastError: unknown
    for (let offset = 0; offset < urls.length; offset += 1) {
      const index = (preferredIndex + offset) % urls.length
      try {
        const response = await fetchFn(urls[index], {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
          signal: AbortSignal.timeout(12_000),
        })
        if (!response.ok) {
          throw new Error(`Transient RPC HTTP ${response.status}`)
        }

        const payload = await response.json() as JsonRpcResponse
        if (payload.error) {
          if (isTransientRpcError(payload.error)) throw new Error(`Transient RPC ${payload.error.code}`)
          throw new RpcExecutionError(payload.error)
        }
        preferredIndex = index
        return payload.result
      } catch (error) {
        if (error instanceof RpcExecutionError) throw error
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Every configured Sepolia RPC endpoint failed.")
  }
}

function isTransientRpcError(error: JsonRpcError) {
  return error.code === -32005 || /429|rate.?limit|too many requests|timeout|temporar|gateway/i.test(error.message)
}
