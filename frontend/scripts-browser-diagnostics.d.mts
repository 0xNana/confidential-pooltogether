export type BrowserRequestDetails = {
  url: string
  postData?: string
}

export type BrowserFailureDetails = {
  url?: string
  postData?: string
  message?: string
}

export type RpcDiagnosticClassifier = {
  observeRequest(details: BrowserRequestDetails): void
  isRpcFailure(details: BrowserFailureDetails): boolean
}

export function createRpcDiagnosticClassifier(configuredRpcUrls?: readonly string[]): RpcDiagnosticClassifier
