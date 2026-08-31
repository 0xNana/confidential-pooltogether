import { describe, expect, it, vi } from "vitest"
import { retryTransient, toUserError } from "./user-errors"

describe("toUserError", () => {
  it("replaces provider payloads and URLs with a short rate-limit message", () => {
    const error = new Error('could not coalesce error (error={ "code": -32005, "message": "Too Many Requests" }, payload={"url":"https://rpc.example/key-secret"})')
    const message = toUserError(error, "Could not read Sepolia.")
    expect(message).toBe("Sepolia is busy. Retry in a moment.")
    expect(message).not.toContain("payload")
    expect(message).not.toContain("https://")
  })

  it("maps wallet and lifecycle errors to actionable copy", () => {
    expect(toUserError(new Error("ACTION_REJECTED"), "fallback")).toBe("Request cancelled in wallet.")
    expect(toUserError(new Error("execution reverted: DrawStillOpen"), "fallback")).toBe("This draw has not reached its deadline yet.")
    expect(toUserError(new Error("execution reverted: ClaimExpired(1)"), "fallback")).toBe("This historical claim window has closed.")
    expect(toUserError(new Error("superseded draw ABI"), "fallback")).toBe("This market is waiting for its continuous-draw replacement deployment.")
    expect(toUserError(new Error("execution reverted: ParticipantLimitReached"), "fallback")).toBe("This draw is full. Your balance remains withdrawable; enter the next draw.")
  })
})

describe("retryTransient", () => {
  it("retries transient provider failures with a bounded attempt count", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValue("ready")
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(retryTransient(operation, { attempts: 3, sleep })).resolves.toBe("ready")
    expect(operation).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it("does not retry deterministic contract failures", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("execution reverted: DrawNotOpen"))
    await expect(retryTransient(operation, { attempts: 3, sleep: vi.fn() })).rejects.toThrow("DrawNotOpen")
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
