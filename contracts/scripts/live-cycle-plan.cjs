function incompleteTasks(state) {
  if (state.hasNextDraw || state.currentDrawId > state.targetDrawId) return []

  const tasks = []
  if (!state.hasDeposit) {
    tasks.push(task("deposit", "Deposit encrypted test principal", state.phase === 0, "draw must be open"))
  }
  if (!state.hasPrizeFunding) {
    const claimWindowOpen = state.phase === 2 && !state.hasClaim && state.now < state.claimClosesAt
    tasks.push(task(
      "fund-prize",
      "Fund an encrypted direct testnet prize",
      state.phase <= 1 || claimWindowOpen,
      "target claim window must still be open and unclaimed",
    ))
  }

  if (state.phase === 0) {
    const prerequisitesReady = state.hasDeposit && state.hasPrizeFunding
    tasks.push(task(
      "close-draw",
      "Close the funded draw",
      prerequisitesReady && state.now >= state.drawClosesAt,
      !prerequisitesReady ? "deposit and prize funding are required" : `wait until ${iso(state.drawClosesAt)}`,
    ))
  }

  if (state.phase <= 1) {
    tasks.push(task("select-winner", "Complete bounded winner selection", state.phase === 1, "draw must be selecting"))
  }

  if (!state.hasClaim) {
    tasks.push(task(
      "claim-prize",
      "Preview and claim the prize with the participant signer",
      state.phase === 2 && state.now < state.claimClosesAt,
      "draw must be inside its claim window",
    ))
  }
  if (!state.hasWithdrawal) {
    tasks.push(task(
      "withdraw-principal",
      "Withdraw the participant's test principal",
      state.phase === 2 && state.hasClaim,
      "successful claim submission is required first",
    ))
  }

  tasks.push(task(
    "open-next-draw",
    "Open the next draw after the claim window",
    state.phase === 2 && state.hasClaim && state.hasWithdrawal && state.now >= state.claimClosesAt,
    state.phase !== 2 ? "draw must be claimable" : `wait until ${iso(state.claimClosesAt)}`,
  ))
  return tasks
}

function nextExecutableTask(tasks) {
  return tasks.find((taskEntry) => taskEntry.ready)
}

function unrecoverableReason(state) {
  if (state.phase === 2 && !state.hasClaim && state.claimClosesAt > 0 && state.now >= state.claimClosesAt) {
    return `claim window expired at ${iso(state.claimClosesAt)} before the target claim was submitted`
  }
  return null
}

function nonzeroClaimRisk(state) {
  if (state.currentDrawId !== state.targetDrawId) return null
  if (!state.hasDeposit && state.participantCount > 0) {
    return "the target participant has no recorded deposit; refusing a draw that cannot guarantee a nonzero claim"
  }
  if (!state.hasDeposit && state.phase > 0) {
    return "the target draw progressed without a recorded participant deposit"
  }
  if (state.hasDeposit && state.participantCount !== 1) {
    return `expected one entrant for deterministic evidence, found ${state.participantCount}`
  }
  return null
}

function task(id, label, ready, blockedBy) {
  return { id, label, ready, blockedBy: ready ? null : blockedBy }
}

function iso(timestamp) {
  if (!timestamp) return "the onchain deadline"
  return new Date(Number(timestamp) * 1000).toISOString()
}

module.exports = { incompleteTasks, nextExecutableTask, unrecoverableReason, nonzeroClaimRisk }
