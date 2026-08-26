import type { ReactNode } from "react"
import { useMemo } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ZamaProvider } from "@zama-fhe/react-sdk"
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi"
import { indexedDBStorage } from "@zama-fhe/sdk"
import { web } from "@zama-fhe/sdk/web"
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains"
import { custom } from "viem"
import { WagmiProvider, useAccount } from "wagmi"
import { createConfig as createWagmiConfig, injected } from "wagmi"
import { sepolia } from "viem/chains"
import { SEPOLIA_FHE_RPC_URL, SEPOLIA_RPC_URLS } from "./lib/contracts"
import { createFailoverRpcRequest } from "./lib/rpc-transport"

const queryClient = new QueryClient()
const sepoliaTransport = custom({ request: createFailoverRpcRequest(SEPOLIA_RPC_URLS) }, { retryCount: 0 })
const wagmiConfig = createWagmiConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: sepoliaTransport },
  ssr: false,
})

export function ConfidentialProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaBoundary>{children}</ZamaBoundary>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

function ZamaBoundary({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const zamaConfig = useMemo(() => createZamaConfig({
    chains: [{ ...zamaSepolia, network: SEPOLIA_FHE_RPC_URL }],
    wagmiConfig,
    relayers: { [zamaSepolia.id]: web() },
    storage: indexedDBStorage,
  }), [])

  return <ZamaProvider key={address ?? "readonly"} config={zamaConfig}>{children}</ZamaProvider>
}
