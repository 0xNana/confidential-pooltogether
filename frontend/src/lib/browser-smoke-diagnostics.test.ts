import { describe, expect, it } from "vitest"

import { createRpcDiagnosticClassifier } from "../../scripts-browser-diagnostics.mjs"

describe("createRpcDiagnosticClassifier", () => {
  it("recognizes HTTP and CORS failures from a configured RPC origin", () => {
    const classifier = createRpcDiagnosticClassifier([
      "https://eth-sepolia.api.onfinality.io/public",
    ])

    expect(classifier.isRpcFailure({
      url: "https://eth-sepolia.api.onfinality.io/public",
    })).toBe(true)
    expect(classifier.isRpcFailure({
      message: "Access to fetch at 'https://eth-sepolia.api.onfinality.io/public' has been blocked by CORS policy",
    })).toBe(true)
  })

  it("learns custom RPC origins from JSON-RPC requests", () => {
    const classifier = createRpcDiagnosticClassifier()

    classifier.observeRequest({
      url: "https://rpc.challenge.example/sepolia",
      postData: '{"jsonrpc":"2.0","id":1,"method":"eth_call"}',
    })

    expect(classifier.isRpcFailure({
      message: "Access to fetch at 'https://rpc.challenge.example/sepolia' has been blocked by CORS policy",
    })).toBe(true)
  })

  it("recognizes a JSON-RPC failure before its origin has been observed", () => {
    const classifier = createRpcDiagnosticClassifier()

    expect(classifier.isRpcFailure({
      url: "https://1rpc.io/sepolia",
      postData: '{"jsonrpc":"2.0","id":2,"method":"eth_chainId"}',
    })).toBe(true)
  })

  it("keeps unrelated CORS and HTTP failures fatal", () => {
    const classifier = createRpcDiagnosticClassifier(["https://1rpc.io/sepolia"])

    expect(classifier.isRpcFailure({
      message: "Access to fetch at 'https://api.example/private' has been blocked by CORS policy",
    })).toBe(false)
    expect(classifier.isRpcFailure({
      url: "https://app.example/assets/index.js",
    })).toBe(false)
    expect(classifier.isRpcFailure({
      message: "Access to fetch at 'https://1rpc.io.evil.example/sepolia' has been blocked by CORS policy",
    })).toBe(false)
  })
})
