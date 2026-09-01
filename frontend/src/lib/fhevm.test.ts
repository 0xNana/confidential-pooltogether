import { describe, expect, it } from "vitest"
import { buildConfidentialAction, formatTokenAmount, parseTokenAmount, SEPOLIA_CUSDT } from "./fhevm"
import { UNDERLYING_ADDRESS } from "./contracts"

describe("FHEVM integration boundary", () => {
  it("binds encrypted inputs to the pool contract that consumes them", () => {
    const action = buildConfidentialAction({
      kind: "deposit",
      amount: 250_000_000n,
      poolAddress: "0x1111111111111111111111111111111111111111",
      account: "0x2222222222222222222222222222222222222222",
    })

    expect(action.encryptionTarget).toBe("0x1111111111111111111111111111111111111111")
    expect(action.stages).toEqual(["encrypt", "prove", "submit", "confirm"])
  })

  it("uses the verified Sepolia cUSDTMock wrapper", () => {
    expect(SEPOLIA_CUSDT).toBe("0x4E7B06D78965594eB5EF5414c357ca21E1554491")
    expect(UNDERLYING_ADDRESS).toBe("0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0")
  })

  it("parses cUSDT using the ERC-7984 token's six decimals", () => {
    expect(parseTokenAmount("12.345678")).toBe(12_345_678n)
    expect(parseTokenAmount("2,002,029")).toBe(2_002_029_000_000n)
    expect(formatTokenAmount(12_345_678n, 6)).toBe("12.345678")
    expect(() => parseTokenAmount("0")).toThrow("greater than zero")
    expect(() => parseTokenAmount("1.0000001")).toThrow()
  })
})
