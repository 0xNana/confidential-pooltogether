async function retryOperation(operation, options = {}) {
  const attempts = options.attempts ?? 3
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error("attempts must be a positive safe integer")
  const delay = options.delay ?? (async () => {})
  const onRetry = options.onRetry ?? (async () => {})

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      if (attempt === attempts) throw error
      await onRetry(error, attempt)
      await delay(attempt, error)
    }
  }

  throw new Error("retry operation exhausted unexpectedly")
}

module.exports = { retryOperation }
