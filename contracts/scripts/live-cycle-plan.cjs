function incompleteTasks(state) {
  if (state.hasClaim && state.hasWithdrawal && state.currentDrawId > state.targetDrawId) return []

  const tasks = []
  const targetIsCurrent = state.currentDrawId === state.targetDrawId
  if (!state.hasDeposit) {
    tasks.push(task("deposit", "Deposit encrypted test principal", targetIsCurrent && state.targetStatus === 0, "target entry draw must be open"))
  }
  if (!state.hasPrizeFunding) {
    tasks.push(task("fund-prize", "Fund an encrypted direct testnet prize", targetIsCurrent && state.targetStatus === 0, "target prize can only be funded while it is the open entry draw"))
  }

  if (state.targetStatus === 0) {
    const prerequisitesReady = state.hasDeposit && state.hasPrizeFunding
    tasks.push(task(
      "close-draw",
      "Finalize the funded entry draw",
      targetIsCurrent && prerequisitesReady && state.now >= state.scheduledClose,
      !prerequisitesReady ? "deposit and prize funding are required" : `wait until ${iso(state.scheduledClose)}`,
    ))
  }
  if (state.targetStatus === 1) {
    tasks.push(task("select-winner", "Complete bounded historical winner selection", true, null))
  }
  if (!state.hasClaim) {
    tasks.push(task(
      "claim-prize",
      "Preview and claim the historical prize",
      state.targetStatus === 2 && state.now < state.claimExpiresAt,
      "target draw must be inside its claim window",
    ))
  }
  if (!state.hasWithdrawal) {
    tasks.push(task(
      "withdraw-principal",
      "Withdraw the participant's test principal",
      state.hasClaim,
      "successful claim submission is required first",
    ))
  }
  if (state.targetStatus === 3) {
    tasks.push(task("sweep-prize", "Sweep the encrypted historical remainder", true, null))
  }
  return tasks
}

function nextExecutableTask(tasks) {
  return tasks.find((taskEntry) => taskEntry.ready)
}

function unrecoverableReason(state) {
  if ((state.targetStatus === 3 || state.targetStatus === 4) && !state.hasClaim) {
    return `claim window expired at ${iso(state.claimExpiresAt)} before the target claim was submitted`
  }
  if (!state.hasPrizeFunding && state.targetStatus !== 0) {
    return "target draw finalized before its prize was funded"
  }
  return null
}

function nonzeroClaimRisk(state) {
  if (!state.hasDeposit && state.participantCount > 0) {
    return "the target participant has no recorded deposit; refusing a draw that cannot guarantee a nonzero claim"
  }
  if (!state.hasDeposit && state.targetStatus > 0) {
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
