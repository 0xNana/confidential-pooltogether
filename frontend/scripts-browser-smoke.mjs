import puppeteer from "puppeteer-core"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

const baseUrl = process.env.CONFIDENTIAL_POOLTOGETHER_BASE_URL ?? "http://127.0.0.1:4173"
const assetsDirectory = resolve(process.cwd(), "dist/assets")
const relayerChunk = (await readdir(assetsDirectory)).find((name) => /^web-.*\.js$/.test(name))
if (!relayerChunk) throw new Error("Built Zama relayer chunk is missing")
const relayerSource = await readFile(resolve(assetsDirectory, relayerChunk), "utf8")
if (/new URL\(["']\/assets\//.test(relayerSource)) {
  throw new Error("FHE runtime assets were emitted as root-absolute URLs")
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
})

const errors = []
const watchErrors = (page) => {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`)
  })
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`))
}

const page = await browser.newPage()
watchErrors(page)
await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 })
await page.goto(`${baseUrl}/`, { waitUntil: "networkidle2", timeout: 30_000 })
await page.waitForSelector('[data-testid="launch-app"]')

const landingText = await page.evaluate(() => document.body.textContent ?? "")
if (!landingText.includes("Save privately") || !landingText.includes("Encrypted balances")) {
  throw new Error("Landing page product and deployment messaging is missing")
}
const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (landingOverflow) throw new Error("Landing page has horizontal overflow at 1440px")

const landingResources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))
if (landingResources.some((url) => /tfhe_bg|kms_lib_bg|workerHelpers|VaultApp/.test(url))) {
  throw new Error("Vault or FHE runtime assets loaded before Launch App")
}
await page.screenshot({ path: "/tmp/confidential-pooltogether-landing-desktop.png", fullPage: true })

await page.click('[data-testid="launch-app"]')
await page.waitForFunction(() => window.location.pathname === "/app", { timeout: 10_000 })
await page.waitForSelector('[data-testid="live-draw"]')
await page.waitForSelector('[data-testid="connect-wallet"]')
await page.waitForFunction(() => {
  const value = document.querySelector(".draw-console-id strong")?.textContent
  return Boolean((value && value !== "Syncing" && value !== "#000") || document.querySelector(".read-error"))
}, { timeout: 60_000 })

const appText = await page.evaluate(() => document.body.textContent ?? "")
if (!appText.includes("Live on Sepolia")) throw new Error("Live deployment status is missing from app")
if (!appText.includes("Your private") || !appText.includes("prize account")) throw new Error("Primary vault heading is missing")
if (appText.includes("Demo wallet") || appText.includes("6,240.18")) throw new Error("Simulated wallet or prize data is still rendered")
const appOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (appOverflow) throw new Error("Vault has horizontal overflow at 1440px")

const submitDisabled = await page.$eval('[data-testid="submit-action"]', (element) => element.hasAttribute("disabled"))
if (!submitDisabled) throw new Error("Confidential action must be gated while disconnected")

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
await mobilePage.waitForSelector('[data-testid="live-draw"]')
await mobilePage.waitForFunction(() => document.querySelector(".draw-console-id strong")?.textContent !== "Syncing" || document.querySelector(".read-error"), { timeout: 60_000 })
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
await narrowPage.waitForSelector('[data-testid="live-draw"]')
const narrowVaultOverflow = await narrowPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
if (narrowVaultOverflow) throw new Error("Vault has horizontal overflow at 320px")
await narrowPage.close()

const walletPage = await browser.newPage()
watchErrors(walletPage)
await walletPage.evaluateOnNewDocument(() => {
  const listeners = new Map()
  window.ethereum = {
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0x1"
      if (method === "eth_accounts" || method === "eth_requestAccounts") return ["0x1111111111111111111111111111111111111111"]
      throw new Error(`Unsupported mock wallet method: ${method}`)
    },
    on: (event, listener) => listeners.set(event, listener),
    removeListener: (event) => listeners.delete(event),
  }
})
await walletPage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
await walletPage.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" })
await walletPage.waitForSelector('[data-testid="connect-wallet"]')
await walletPage.click('[data-testid="connect-wallet"]')
await walletPage.waitForFunction(() => document.body.textContent?.includes("Switch to Sepolia"), { timeout: 10_000 })
await walletPage.close()

const fhePage = await browser.newPage()
watchErrors(fhePage)
await fhePage.evaluateOnNewDocument(() => {
  const listeners = new Map()
  window.ethereum = {
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0xaa36a7"
      if (method === "eth_accounts" || method === "eth_requestAccounts") return ["0x2222222222222222222222222222222222222222"]
      if (method === "eth_signTypedData_v4") return `0x${"11".repeat(65)}`
      throw new Error(`Unsupported FHE wallet method: ${method}`)
    },
    on: (event, listener) => listeners.set(event, listener),
    removeListener: (event) => listeners.delete(event),
  }
})
await fhePage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
await fhePage.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" })
await fhePage.waitForSelector('[data-testid="connect-wallet"]')
await fhePage.click('[data-testid="connect-wallet"]')
await fhePage.waitForSelector('[data-testid="wallet-menu-trigger"]')
await fhePage.click('[data-testid="wallet-menu-trigger"]')
await fhePage.waitForSelector(".status-text.ready", { timeout: 90_000 })

const fheResources = await fhePage.evaluate(async () => {
  const urls = performance.getEntriesByType("resource").map((entry) => entry.name)
  const wasmUrls = urls.filter((url) => /tfhe_bg|kms_lib_bg/.test(url))
  return Promise.all(wasmUrls.map(async (url) => {
    const response = await fetch(url)
    const bytes = new Uint8Array(await response.clone().arrayBuffer()).slice(0, 4)
    return { url, status: response.status, type: response.headers.get("content-type"), magic: Array.from(bytes) }
  }))
})
if (fheResources.length < 2 || fheResources.some((resource) => resource.status !== 200 || resource.magic.join(",") !== "0,97,115,109")) {
  throw new Error(`FHE runtime assets are not valid WASM: ${JSON.stringify(fheResources)}`)
}
await fhePage.waitForSelector('[data-testid="authorize-session"]', { timeout: 30_000 })
await fhePage.click('[data-testid="authorize-session"]')
await fhePage.waitForFunction(() => document.body.textContent?.includes("Private session authorized"), { timeout: 30_000 })
await fhePage.close()

if (errors.length > 0) throw new Error(errors.join("\n"))

console.log("Browser smoke passed: landing isolation, Launch App, live state, FHE runtime initialization, private session authorization, proof drawer, wallet network gate, disconnected gating, and 320px/390px/1440px layouts")
await browser.close()
