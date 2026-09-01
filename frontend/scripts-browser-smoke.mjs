import puppeteer from "puppeteer-core"
import { Wallet } from "ethers"
import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { createRpcDiagnosticClassifier } from "./scripts-browser-diagnostics.mjs"
import { PUBLIC_SEPOLIA_RPC_URLS } from "./sepolia-rpc-endpoints.mjs"

const baseUrl = process.env.CONFIDENTIAL_POOLTOGETHER_BASE_URL ?? "http://127.0.0.1:4173"
const assetsDirectory = resolve(process.cwd(), "dist/assets")
const assets = await readdir(assetsDirectory)
const fheAssets = assets.filter((name) => /(?:tfhe|kms_lib)/.test(name))
if (fheAssets.length < 2) throw new Error("Built Zama FHE assets are missing")

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
})

const errors = []
const networkDiagnostics = []
const hasAccessibleNode = (node, role, name) => Boolean(
  node && (
    (node.role === role && node.name?.includes(name))
    || node.children?.some((child) => hasAccessibleNode(child, role, name))
  )
)
const watchErrors = (page) => {
  const rpcDiagnostics = createRpcDiagnosticClassifier(PUBLIC_SEPOLIA_RPC_URLS)
  page.on("request", (request) => {
    rpcDiagnostics.observeRequest({ url: request.url(), postData: request.postData() })
  })
  page.on("console", (message) => {
    if (message.type() !== "error") return
    const entry = `console: ${message.text()}`
    if (
      /Failed to load resource|ERR_NETWORK_CHANGED/.test(message.text())
      || rpcDiagnostics.isRpcFailure({ message: message.text() })
    ) networkDiagnostics.push(entry)
    else errors.push(entry)
  })
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`))
  page.on("response", (response) => {
    if (response.status() < 400) return
    const entry = `network: ${response.status()} ${new URL(response.url()).origin}`
    if (rpcDiagnostics.isRpcFailure({
      url: response.url(),
      postData: response.request().postData(),
    })) networkDiagnostics.push(entry)
    else errors.push(entry)
  })
  page.on("requestfailed", (request) => {
    const entry = `network: ${request.failure()?.errorText ?? "request failed"} ${new URL(request.url()).origin}`
    if (rpcDiagnostics.isRpcFailure({ url: request.url(), postData: request.postData() })) networkDiagnostics.push(entry)
    else errors.push(entry)
  })
}

const waitForLiveState = async (page) => {
  await page.waitForFunction(() => {
    const draw = document.querySelector('[data-testid="live-draw"]')
    return draw?.getAttribute("data-state") === "ready" || draw?.getAttribute("data-state") === "error" || Boolean(document.querySelector(".read-error"))
  }, { timeout: 60_000 })
  const state = await page.$eval('[data-testid="live-draw"]', (draw) => ({
    state: draw.getAttribute("data-state"),
    error: document.querySelector(".read-error")?.textContent?.trim(),
  }))
  if (state.state !== "ready" || state.error) throw new Error(`Live Sepolia state failed to load: ${state.error || state.state}`)
}

const verifyPrivateSession = async () => {
  const fhePage = await browser.newPage()
  watchErrors(fhePage)
  const fheWallet = new Wallet(`0x${"11".repeat(32)}`)
  await fhePage.exposeFunction("__signFheTypedData", async (value) => {
    const typedData = typeof value === "string" ? JSON.parse(value) : value
    const { EIP712Domain: _domainType, ...types } = typedData.types
    return fheWallet.signTypedData(typedData.domain, types, typedData.message)
  })
  await fhePage.evaluateOnNewDocument((address) => {
    const listeners = new Map()
    window.ethereum = {
      request: async ({ method, params = [] }) => {
        if (method === "eth_chainId") return "0xaa36a7"
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [address]
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }]
        if (method === "wallet_revokePermissions") return null
        if (method === "eth_signTypedData_v4" || method === "eth_signTypedData") {
          const typedData = params.find((value) => typeof value === "string" && value.startsWith("{"))
          if (!typedData) throw new Error("Typed data payload missing from mock wallet request")
          return window.__signFheTypedData(typedData)
        }
        throw new Error(`Unsupported FHE wallet method: ${method}`)
      },
      on: (event, listener) => listeners.set(event, listener),
      removeListener: (event) => listeners.delete(event),
    }
  }, fheWallet.address)
  await fhePage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await fhePage.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" })
  await fhePage.waitForFunction(() => Boolean(document.querySelector('[data-testid="connect-wallet"], [data-testid="wallet-menu-trigger"]')), { timeout: 30_000 })
  if (await fhePage.$('[data-testid="connect-wallet"]')) await fhePage.click('[data-testid="connect-wallet"]')
  await fhePage.waitForSelector('[data-testid="wallet-menu-trigger"]')
  await fhePage.click('[data-testid="wallet-menu-trigger"]')
  await fhePage.waitForSelector(".status-text.ready", { timeout: 90_000 })

  const fheResources = await fhePage.evaluate(async () => {
    const urls = performance.getEntriesByType("resource").map((entry) => entry.name)
    const runtimeUrls = urls.filter((url) => /tfhe|kms_lib/.test(url))
    return Promise.all(runtimeUrls.map(async (url) => {
      const response = await fetch(url)
      return { url, status: response.status, type: response.headers.get("content-type") }
    }))
  })
  if (fheResources.some((resource) => resource.status !== 200)) {
    throw new Error(`FHE runtime assets are not available: ${JSON.stringify(fheResources)}`)
  }
  await fhePage.waitForSelector('[data-testid="authorize-session"]', { timeout: 30_000 })
  await fhePage.click('[data-testid="authorize-session"]')
  await fhePage.waitForFunction(() => document.body.textContent?.includes("Private session authorized"), { timeout: 60_000 })
  await fhePage.close()
}

const verifyWalletNetworkGate = async () => {
  const walletContext = await browser.createBrowserContext()
  const walletPage = await walletContext.newPage()
  watchErrors(walletPage)
  await walletPage.evaluateOnNewDocument(() => {
    const listeners = new Map()
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x1"
        if (method === "eth_accounts" || method === "eth_requestAccounts") return ["0x1111111111111111111111111111111111111111"]
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }]
        if (method === "wallet_revokePermissions") return null
        throw new Error(`Unsupported mock wallet method: ${method}`)
      },
      on: (event, listener) => listeners.set(event, listener),
      removeListener: (event) => listeners.delete(event),
    }
  })
  await walletPage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await walletPage.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" })
  await walletPage.waitForFunction(() => Boolean(document.querySelector('[data-testid="connect-wallet"], [data-testid="switch-network"]')), { timeout: 30_000 })
  if (await walletPage.$('[data-testid="connect-wallet"]')) await walletPage.click('[data-testid="connect-wallet"]')
  await walletPage.waitForSelector('[data-testid="switch-network"]', { timeout: 10_000 })
  await walletContext.close()
}

try {

await verifyPrivateSession()
await verifyWalletNetworkGate()

const page = await browser.newPage()
watchErrors(page)
await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 })
await page.goto(`${baseUrl}/`, { waitUntil: "networkidle2", timeout: 30_000 })
await page.waitForSelector('[data-testid="launch-app"]')

const landingText = await page.evaluate(() => document.body.textContent ?? "")
if (!landingText.includes("Prize savings with a private balance") || !landingText.includes("Private draw console") || !landingText.includes("Principal stays yours")) {
  throw new Error("Landing page product and deployment messaging is missing")
}
const landingAccessibility = await page.accessibility.snapshot()
if (!hasAccessibleNode(landingAccessibility, "heading", "Confidential PoolTogether") || !hasAccessibleNode(landingAccessibility, "link", "Enter the private draw")) {
  throw new Error("Landing page accessibility tree is missing its heading or primary action")
}
const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (landingOverflow) throw new Error("Landing page has horizontal overflow at 1440px")
for (const width of [1024, 768]) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  if (overflow) throw new Error(`Landing page has horizontal overflow at ${width}px`)
}
await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 })

const landingResources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))
if (landingResources.some((url) => /tfhe_bg|kms_lib_bg|workerHelpers|VaultApp/.test(url))) {
  throw new Error("Vault or FHE runtime assets loaded before Launch App")
}
await page.screenshot({ path: "/tmp/confidential-pooltogether-landing-desktop.png", fullPage: true })

await page.click('[data-testid="launch-app"]')
await page.waitForFunction(() => window.location.pathname === "/app", { timeout: 10_000 })
await page.waitForSelector('[data-testid="shell-overview"]')
await page.waitForSelector('[data-testid="shell-draws"]')
await page.waitForSelector('[data-testid="connect-wallet"]')
const shellOrder = await page.$$eval('.sidebar-nav [data-testid^="shell-"]', (items) => items.map((item) => item.textContent?.trim()))
const expectedShellOrder = ["Overview", "Deposit", "Draws", "Withdraw", "Shield", "Unshield", "Send", "Earn", "Activity"]
if (JSON.stringify(shellOrder) !== JSON.stringify(expectedShellOrder)) {
  throw new Error(`Unexpected shell order: ${shellOrder.join(" → ")}`)
}
if (await page.$('[data-testid="shell-vaults"]')) {
  throw new Error("Vaults is still rendered as a shell destination")
}
const appAccessibility = await page.accessibility.snapshot()
if (!hasAccessibleNode(appAccessibility, "button", "Overview") || !hasAccessibleNode(appAccessibility, "button", "Draws") || !hasAccessibleNode(appAccessibility, "button", "Deposit") || !hasAccessibleNode(appAccessibility, "button", "Wallet required")) {
  throw new Error("Vault accessibility tree is missing navigation or wallet controls")
}
if (await page.$('[data-testid="live-draw"]')) {
  throw new Error("Live draw strip is still rendered on Overview")
}
if (await page.$('[data-testid="enter-draw"]')) {
  await page.click('[data-testid="enter-draw"]')
  await page.waitForFunction(() => document.querySelector('[data-testid="shell-deposit"]')?.getAttribute("aria-current") === "page")
}
await page.click('[data-testid="shell-deposit"]')
await page.waitForFunction(() => !document.querySelector('[data-testid="live-draw"]'))

await page.waitForSelector('[data-testid="submit-action"]')
await page.waitForSelector('[data-testid="deposit-steps"]')
const depositSteps = await page.$$eval('[data-testid="deposit-steps"] li', (steps) => steps.map((step) => step.textContent?.trim()))
if (depositSteps.length !== 3 || !depositSteps.some((step) => step?.includes("Choose vault")) || !depositSteps.some((step) => step?.includes("Deposit privately"))) {
  throw new Error("Deposit journey is missing its guided steps")
}
await page.waitForSelector('[data-testid="deposit-market-cusdc"]')
const tokenLogosLoaded = await page.$$eval(".deposit-token-mark img", (logos) => logos.length === 2 && logos.every((logo) => logo.complete && logo.naturalWidth > 0))
if (!tokenLogosLoaded) throw new Error("Deposit token logos did not load")
const readinessText = await page.$eval(".deposit-readiness", (element) => element.textContent ?? "")
if (readinessText.includes("Wallet") || readinessText.includes("Network") || readinessText.includes("Sepolia")) {
  throw new Error("Deposit readiness repeats wallet or network status")
}
await page.click('[data-testid="deposit-market-cusdc"]')
await page.waitForFunction(() => document.querySelector('[data-testid="deposit-market-cusdc"]')?.getAttribute("aria-pressed") === "true")
const usdcText = await page.evaluate(() => document.body.textContent ?? "")
if (!usdcText.includes("cUSDC")) throw new Error("cUSDC market did not become active from Deposit")

await page.click('[data-testid="shell-draws"]')
await page.waitForSelector('[data-testid="live-draw"]')
await page.waitForSelector(".lifecycle-control")
await page.waitForSelector(".prize-card")
await waitForLiveState(page)
await page.screenshot({ path: "/tmp/confidential-pooltogether-draws-desktop.png", fullPage: true })

for (const view of ["overview", "deposit", "withdraw", "shield", "unshield", "send", "earn", "activity"]) {
  await page.click(`[data-testid="shell-${view}"]`)
  await page.waitForFunction(() => !document.querySelector('[data-testid="live-draw"]'))
  if (view === "shield" || view === "unshield") {
    await page.waitForSelector(`[data-testid="${view}-market-select"]`)
    await page.select(`[data-testid="${view}-market-select"]`, "cUSDC")
    await page.waitForFunction((selector) => document.querySelector(selector)?.value === "cUSDC", {}, `[data-testid="${view}-market-select"]`)
  }
  if (view === "withdraw" || view === "send") {
    await page.waitForSelector(`[data-testid="${view}-market-select"]`)
    await page.select(`[data-testid="${view}-market-select"]`, "cUSDC")
    await page.waitForFunction((selector) => document.querySelector(selector)?.value === "cUSDC", {}, `[data-testid="${view}-market-select"]`)
  }
}

await page.click('[data-testid="shell-overview"]')
if (await page.$(".lifecycle-control")) {
  throw new Error("Permissionless draw action returned after navigating back to Overview")
}
const overviewHasVaultCatalog = await page.evaluate(() => Boolean(document.querySelector('[aria-labelledby="vaults-title"]')))
if (overviewHasVaultCatalog) throw new Error("Vault catalog is still buried in Overview")
await page.click('[data-testid="shell-activity"]')
await page.waitForFunction(() => {
  const feed = document.querySelector('[data-testid="activity-feed"]')
  return Boolean(feed && feed.getAttribute("data-state") !== "loading")
}, { timeout: 60_000 })
if (await page.$(".read-error")) throw new Error("Activity fallback degraded the cUSDC market read")
await page.click('[data-testid="shell-deposit"]')
await page.waitForSelector('[data-testid="deposit-market-cusdt"]')
await page.click('[data-testid="deposit-market-cusdt"]')
await page.waitForFunction(() => document.querySelector('[data-testid="deposit-market-cusdt"]')?.getAttribute("aria-pressed") === "true")
await page.click('[data-testid="shell-draws"]')
await waitForLiveState(page)
await page.click('[data-testid="shell-deposit"]')

const appText = await page.evaluate(() => document.body.textContent ?? "")
if (appText.includes("Demo wallet") || appText.includes("6,240.18")) throw new Error("Simulated wallet or prize data is still rendered")
const appOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (appOverflow) throw new Error("Vault has horizontal overflow at 1440px")
for (const width of [1024, 768]) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  if (overflow) throw new Error(`Vault has horizontal overflow at ${width}px`)
}
await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 })

const submitDisabled = await page.$eval('[data-testid="submit-action"]', (element) => element.hasAttribute("disabled"))
if (!submitDisabled) throw new Error("Confidential action must be gated while disconnected")
const workflowStep = await page.$eval(".vault-main", (element) => element.getAttribute("data-workflow-step"))
if (workflowStep !== "connect") throw new Error(`Unexpected disconnected workflow state: ${workflowStep}`)

await page.click('[data-testid="open-proof"]')
await page.waitForSelector('[data-testid="close-proof"]')
await page.screenshot({ path: "/tmp/confidential-pooltogether-production-proof.png", fullPage: false })
await page.click('[data-testid="close-proof"]')
await page.setViewport({ width: 1440, height: 920, deviceScaleFactor: 1 })
await page.screenshot({ path: "/tmp/confidential-pooltogether-vault-preview.png", fullPage: false })
await page.screenshot({ path: "/tmp/confidential-pooltogether-production-desktop.png", fullPage: true })

const mobilePage = await browser.newPage()
watchErrors(mobilePage)
await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
await mobilePage.goto(`${baseUrl}/`, { waitUntil: "networkidle2", timeout: 30_000 })
await mobilePage.waitForSelector('[data-testid="launch-app"]')
const mobileLandingOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (mobileLandingOverflow) throw new Error("Landing page has horizontal overflow at 390px")
await mobilePage.screenshot({ path: "/tmp/confidential-pooltogether-landing-mobile.png", fullPage: true })
await mobilePage.click('[data-testid="launch-app"]')
await mobilePage.waitForSelector('[data-testid="shell-draws"]')
await mobilePage.waitForSelector('[data-testid="shell-deposit"]')
await mobilePage.click('[data-testid="shell-draws"]')
await mobilePage.waitForSelector('[data-testid="live-draw"]')
await waitForLiveState(mobilePage)
const mobileDrawsOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (mobileDrawsOverflow) throw new Error("Draws has horizontal overflow at 390px")
await mobilePage.screenshot({ path: "/tmp/confidential-pooltogether-draws-mobile.png", fullPage: true })
await mobilePage.click('[data-testid="shell-deposit"]')
await mobilePage.waitForFunction(() => !document.querySelector('[data-testid="live-draw"]'))
const mobileVaultOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (mobileVaultOverflow) throw new Error("Vault has horizontal overflow at 390px")
await mobilePage.screenshot({ path: "/tmp/confidential-pooltogether-production-mobile.png", fullPage: true })
await mobilePage.close()

const narrowPage = await browser.newPage()
watchErrors(narrowPage)
await narrowPage.setViewport({ width: 320, height: 720, deviceScaleFactor: 1 })
await narrowPage.goto(`${baseUrl}/`, { waitUntil: "networkidle2", timeout: 30_000 })
await narrowPage.waitForSelector('[data-testid="launch-app"]')
const narrowLandingOverflow = await narrowPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (narrowLandingOverflow) throw new Error("Landing page has horizontal overflow at 320px")
await narrowPage.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded", timeout: 30_000 })
await narrowPage.waitForSelector('[data-testid="shell-deposit"]')
await narrowPage.click('[data-testid="shell-deposit"]')
await narrowPage.waitForFunction(() => !document.querySelector('[data-testid="live-draw"]'))
const narrowVaultOverflow = await narrowPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (narrowVaultOverflow) throw new Error("Vault has horizontal overflow at 320px")
await narrowPage.close()

if (errors.length > 0) throw new Error(errors.join("\n"))

console.log("Browser smoke passed: landing isolation, accessibility trees, Launch App, cUSDT/cUSDC live state, FHE runtime initialization, private session authorization, proof drawer, wallet network gate, disconnected gating, and 320px/390px/768px/1024px/1440px layouts")
} catch (error) {
  const diagnostics = [...errors, ...networkDiagnostics]
  if (diagnostics.length > 0) console.error(`Captured browser diagnostics before failure:\n${diagnostics.join("\n")}`)
  throw error
} finally {
  await browser.close()
}
