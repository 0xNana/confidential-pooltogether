type RetryOptions = {
  attempts?: number
  baseDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
}

const TRANSIENT_ERROR = /429|too many requests|rate.?limit|network error|failed to fetch|timeout|timed out|socket|ECONN|SERVER_ERROR|UNKNOWN_ERROR|could not coalesce|missing response|gateway/i

export function isTransientProviderError(error: unknown) {
  return TRANSIENT_ERROR.test(errorText(error))
}

export async function retryTransient<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 350)
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)))

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= attempts || !isTransientProviderError(error)) throw error
      await sleep(baseDelayMs * attempt)
    }
  }
}

export function toUserError(error: unknown, fallback: string) {
  const message = errorText(error)
  if (/user rejected|rejected the request|ACTION_REJECTED|SigningRejected/i.test(message)) return "Request cancelled in wallet."
  if (/insufficient funds/i.test(message)) return "Not enough Sepolia ETH to pay gas."
  if (/429|too many requests|rate.?limit/i.test(message)) return "Sepolia is busy. Retry in a moment."
  if (/superseded draw ABI/i.test(message)) return "This market is waiting for its continuous-draw replacement deployment."
  if (/network error|failed to fetch|timeout|timed out|socket|ECONN|SERVER_ERROR|UNKNOWN_ERROR|could not coalesce|missing response|gateway/i.test(message)) {
    return "Sepolia is temporarily unavailable. Check your connection and retry."
  }
  if (/DrawStillOpen/i.test(message)) return "This draw has not reached its deadline yet."
  if (/ParticipantLimitReached/i.test(message)) return "This draw is full. Your balance remains withdrawable; enter the next draw."
  if (/DrawNotOpen/i.test(message)) return "This draw is no longer the open entry draw. Refresh and retry."
  if (/DrawNotSelecting/i.test(message)) return "Winner selection is not active for this draw."
  if (/InvalidBatchSize/i.test(message)) return "The selection batch is invalid. Refresh the draw state and retry."
  if (/DrawNotClaimable/i.test(message)) return "This draw is not claimable yet."
  if (/ClaimExpired/i.test(message)) return "This historical claim window has closed."
  if (/DrawNotExpired/i.test(message)) return "This draw is not ready to sweep."
  if (/DrawAlreadySwept/i.test(message)) return "This draw's encrypted remainder was already swept."
  return fallback
}

export function reportDiagnostic(scope: string, error: unknown) {
  if (!import.meta.env.DEV) return
  const detail = errorText(error)
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted-url]")
    .replace(/0x[a-f\d]{64}/gi, "[redacted-hash]")
    .slice(0, 800)
  console.debug(`[${scope}]`, detail)
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : ""
}
