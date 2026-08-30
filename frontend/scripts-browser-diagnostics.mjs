const isJsonRpcRequest = (postData) => typeof postData === "string" && postData.includes('"jsonrpc"')

const toOrigin = (url) => {
  if (!url) return undefined
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

const urlsIn = (message) => message?.match(/https?:\/\/[^\s'"\])]+/g) ?? []

export const createRpcDiagnosticClassifier = (configuredRpcUrls = []) => {
  const rpcOrigins = new Set(configuredRpcUrls.map(toOrigin).filter(Boolean))

  const observeRequest = ({ url, postData }) => {
    if (!isJsonRpcRequest(postData)) return
    const origin = toOrigin(url)
    if (origin) rpcOrigins.add(origin)
  }

  const isRpcFailure = ({ url, postData, message }) => {
    if (isJsonRpcRequest(postData)) return true
    const failureOrigins = [url, ...urlsIn(message)].map(toOrigin).filter(Boolean)
    return failureOrigins.some((origin) => rpcOrigins.has(origin))
  }

  return { observeRequest, isRpcFailure }
}
