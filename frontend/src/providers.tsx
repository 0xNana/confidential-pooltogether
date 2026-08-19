import type { ReactNode } from "react"
import { useMemo } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ZamaProvider } from "@zama-fhe/react-sdk"
import { indexedDBStorage } from "@zama-fhe/sdk"
import { createConfig as createZamaConfig } from "@zama-fhe/sdk/viem"
import { web } from "@zama-fhe/sdk/web"
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains"
import { createPublicClient, createWalletClient, custom, http, zeroAddress, type EIP1193Provider } from "viem"
import { WagmiProvider, useAccount, useWalletClient } from "wagmi"
import { createConfig as createWagmiConfig, injected } from "wagmi"
import { sepolia } from "viem/chains"
import { SEPOLIA_RPC_URL } from "./lib/contracts"

const queryClient = new QueryClient()
const wagmiConfig = createWagmiConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
  ssr: false,
})
const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) })
const fallbackEthereum: EIP1193Provider = {
  on: () => {},
  removeListener: () => {},
  request: async () => { throw new Error("Connect a wallet before using confidential features.") },
}

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
  const { data: connectedWalletClient } = useWalletClient()
  const ethereum = typeof window !== "undefined" ? window.ethereum : undefined
  const walletClient = useMemo(() => connectedWalletClient ?? createWalletClient({
    account: zeroAddress,
    chain: sepolia,
    transport: custom((ethereum as EIP1193Provider | undefined) ?? fallbackEthereum),
  }), [connectedWalletClient, ethereum])
  const zamaConfig = useMemo(() => createZamaConfig({
    chains: [{ ...zamaSepolia, network: SEPOLIA_RPC_URL }],
    publicClient,
    walletClient,
    relayers: { [zamaSepolia.id]: web() },
    storage: indexedDBStorage,
  }), [walletClient])

  return <ZamaProvider key={address ?? "readonly"} config={zamaConfig}>{children}</ZamaProvider>
}
