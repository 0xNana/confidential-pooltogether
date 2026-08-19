import type { Signer } from "ethers"
import { hexlify } from "ethers"
import { POOL_ADDRESS, SEPOLIA_RPC_URL, type Address } from "./contracts"

type RelayerModule = typeof import("@zama-fhe/relayer-sdk/web")
type FhevmInstance = Awaited<ReturnType<RelayerModule["createInstance"]>>

export type RelayerProgress = {
  type?: string
  step?: number
  totalSteps?: number
}

type SessionPermit = {
  account: Address
  contractAddresses: Address[]
  privateKey: string
  publicKey: string
  signature: string
  startTimestamp: number
  durationDays: number
}

let instancePromise: Promise<FhevmInstance> | undefined

export async function getFhevmInstance() {
  if (!instancePromise) {
    instancePromise = import("@zama-fhe/relayer-sdk/web").then(async (sdk) => {
      await sdk.initSDK()
      return sdk.createInstance({ ...sdk.SepoliaConfig, network: SEPOLIA_RPC_URL })
    }).catch((error) => {
      instancePromise = undefined
      throw error
    })
  }
  return instancePromise
}

export async function encryptPoolAmount(amount: bigint, account: Address) {
  const instance = await getFhevmInstance()
  const input = instance.createEncryptedInput(POOL_ADDRESS, account)
  input.add64(amount)
  const encrypted = await input.encrypt()
  return {
    handle: hexlify(encrypted.handles[0]),
    inputProof: hexlify(encrypted.inputProof),
  }
}

export async function createSessionPermit(
  signer: Signer,
  account: Address,
  contractAddresses: Address[],
) {
  const instance = await getFhevmInstance()
  const keypair = instance.generateKeypair()
  const startTimestamp = Math.floor(Date.now() / 1000)
  const durationDays = 1
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimestamp,
    durationDays,
  )
  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification.map((field) => ({
        name: field.name,
        type: field.type,
      })),
    },
    eip712.message,
  )
  const permit: SessionPermit = {
    account,
    contractAddresses,
    privateKey: keypair.privateKey,
    publicKey: keypair.publicKey,
    signature,
    startTimestamp,
    durationDays,
  }
  sessionStorage.setItem(permitKey(account), JSON.stringify(permit))
  return permit
}

export function hasSessionPermit(account?: Address) {
  return account ? Boolean(readPermit(account)) : false
}

export function clearSessionPermit(account?: Address) {
  if (account) sessionStorage.removeItem(permitKey(account))
}

export async function decryptHandles(
  account: Address,
  handles: Array<{ handle: string; contractAddress: Address }>,
  onProgress?: (progress: RelayerProgress) => void,
) {
  const permit = readPermit(account)
  if (!permit) throw new Error("Authorize confidential reads before decrypting.")
  const instance = await getFhevmInstance()
  return instance.userDecrypt(
    handles,
    permit.privateKey,
    permit.publicKey,
    permit.signature,
    permit.contractAddresses,
    account,
    permit.startTimestamp,
    permit.durationDays,
    { onProgress },
  )
}

function readPermit(account: Address): SessionPermit | null {
  const raw = sessionStorage.getItem(permitKey(account))
  if (!raw) return null
  try {
    const permit = JSON.parse(raw) as SessionPermit
    const expiresAt = permit.startTimestamp + permit.durationDays * 86_400
    if (permit.account.toLowerCase() !== account.toLowerCase() || Date.now() / 1000 >= expiresAt) {
      clearSessionPermit(account)
      return null
    }
    return permit
  } catch {
    clearSessionPermit(account)
    return null
  }
}

function permitKey(account: Address) {
  return `confidential-pooltogether:fhe-permit:${account.toLowerCase()}`
}
