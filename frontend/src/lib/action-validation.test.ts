import { describe, expect, it } from "vitest"
import { validateActionAmount } from "./action-validation"

describe("validateActionAmount", () => {
  it("requires the relevant confidential balance before submitting", () => {
    expect(validateActionAmount("deposit", "100", undefined)).toBe("Reveal your private wallet balance first")
    expect(validateActionAmount("withdraw", "100", undefined)).toBe("Reveal your deposited principal first")
  })

  it("rejects an amount that would settle as encrypted zero", () => {
    expect(validateActionAmount("deposit", "100.000001", 100_000_000n)).toBe("Amount exceeds your private wallet balance")
    expect(validateActionAmount("withdraw", "100.000001", 100_000_000n)).toBe("Amount exceeds your deposited principal")
  })

  it("accepts a positive amount within the locally decrypted balance", () => {
    expect(validateActionAmount("deposit", "25", 100_000_000n)).toBeUndefined()
    expect(validateActionAmount("withdraw", "100", 100_000_000n)).toBeUndefined()
  })
})
