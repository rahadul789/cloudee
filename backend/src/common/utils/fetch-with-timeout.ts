export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] & { timeoutMs?: number } = {},
) {
  const timeoutMs = Math.max(1, init.timeoutMs ?? 3_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const { timeoutMs: _timeoutMs, signal, ...fetchInit } = init

  try {
    return await fetch(input, {
      ...fetchInit,
      signal: signal ?? controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

