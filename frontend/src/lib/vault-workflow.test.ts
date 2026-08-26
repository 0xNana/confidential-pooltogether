import { describe, expect, it } from "vitest"
import { deriveVaultWorkflowStep, type VaultWorkflowState } from "./vault-workflow"

const connected: VaultWorkflowState = {
  account: true,
  correctChain: true,
  permitReady: true,
  isOperator: true,
  principal: 0n,
  phase: 0,
  deadlineReached: false,
  claimable: false,
}

describe("deriveVaultWorkflowStep", () => {
  it("covers the public and private vault flow from connection through withdrawal", () => {
    expect(deriveVaultWorkflowStep({ ...connected, account: false })).toBe("connect")
    expect(deriveVaultWorkflowStep({ ...connected, correctChain: false })).toBe("switch-network")
    expect(deriveVaultWorkflowStep({ ...connected, permitReady: false })).toBe("authorize-private-reads")
    expect(deriveVaultWorkflowStep({ ...connected, principal: undefined })).toBe("reveal-position")
    expect(deriveVaultWorkflowStep({ ...connected, isOperator: false })).toBe("approve-operator")
    expect(deriveVaultWorkflowStep(connected)).toBe("deposit")
    expect(deriveVaultWorkflowStep({ ...connected, principal: 100n })).toBe("wait-for-close")
    expect(deriveVaultWorkflowStep({ ...connected, principal: 100n, deadlineReached: true })).toBe("close-draw")
    expect(deriveVaultWorkflowStep({ ...connected, principal: 100n, phase: 1 })).toBe("continue-selection")
    expect(deriveVaultWorkflowStep({ ...connected, principal: 100n, phase: 2, claimable: true })).toBe("preview-prize")
    expect(deriveVaultWorkflowStep({ ...connected, principal: 100n, phase: 2, claimable: true, prize: 50n })).toBe("claim-prize")
    expect(deriveVaultWorkflowStep({ ...connected, principal: 100n, phase: 2, claimable: true, prize: 0n })).toBe("withdraw")
    expect(deriveVaultWorkflowStep({ ...connected, phase: 2, claimable: false })).toBe("open-next-draw")
  })
})
