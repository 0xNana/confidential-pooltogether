import { lazy, Suspense } from "react"
import { LandingPage } from "./routes/LandingPage"
import { ConfidentialProviders } from "./providers"

const VaultApp = lazy(() => import("./routes/VaultApp"))

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/"

  if (path === "/app") {
    return (
      <Suspense fallback={<AppLoading />}>
        <ConfidentialProviders><VaultApp /></ConfidentialProviders>
      </Suspense>
    )
  }

  return <LandingPage />
}

function AppLoading() {
  return (
    <main className="app-loading" aria-live="polite" aria-busy="true">
      <span className="app-loading-mark" aria-hidden="true" />
      <p>Opening confidential vault…</p>
    </main>
  )
}
