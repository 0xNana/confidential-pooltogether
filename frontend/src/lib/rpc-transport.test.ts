import { describe, expect, it, vi } from "vitest"
import { createFailoverRpcRequest } from "./rpc-transport"

describe("createFailoverRpcRequest", () => {
  it("rotates on rate limits and keeps the healthy endpoint preferred", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "https://primary.example") return new Response("rate limited", { status: 429 })
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" })
    })
    const request = createFailoverRpcRequest(["https://primary.example", "https://fallback.example"], fetchFn)

    await expect(request({ method: "eth_chainId" })).resolves.toBe("0xaa36a7")
    await expect(request({ method: "eth_chainId" })).resolves.toBe("0xaa36a7")
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      "https://primary.example",
      "https://fallback.example",
      "https://fallback.example",
    ])
  })

  it("does not hide deterministic JSON-RPC execution errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({
      jsonrpc: "2.0",
      id: 1,
      error: { code: 3, message: "execution reverted: DrawNotOpen" },
    }))
    const request = createFailoverRpcRequest(["https://primary.example", "https://fallback.example"], fetchFn)

    await expect(request({ method: "eth_call", params: [] })).rejects.toThrow("DrawNotOpen")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
