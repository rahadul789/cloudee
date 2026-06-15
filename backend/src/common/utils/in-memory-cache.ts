type CacheEntry<V> = {
  expiresAt: number
  staleExpiresAt: number
  value?: V
  promise?: Promise<V>
}

export function createInMemoryAsyncCache<V>(options: {
  ttlMs: number
  maxEntries?: number
  staleWhileRevalidateMs?: number
}) {
  const entries = new Map<string, CacheEntry<V>>()
  const maxEntries = Math.max(1, options.maxEntries ?? 100)
  const staleWhileRevalidateMs = Math.max(0, options.staleWhileRevalidateMs ?? 0)

  function pruneExpired(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.staleExpiresAt <= now && !entry.promise) {
        entries.delete(key)
      }
    }
  }

  function evictIfNeeded() {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      entries.delete(oldestKey)
    }
  }

  function touch(key: string, entry: CacheEntry<V>) {
    entries.delete(key)
    entries.set(key, entry)
  }

  function createEntry(value?: V): CacheEntry<V> {
    const now = Date.now()
    return {
      value,
      expiresAt: now + options.ttlMs,
      staleExpiresAt: now + options.ttlMs + staleWhileRevalidateMs,
    }
  }

  function startLoad(key: string, entry: CacheEntry<V>, loader: () => Promise<V>) {
    const promise = loader()
      .then((value) => {
        const cachedEntry = createEntry(value)
        entries.set(key, cachedEntry)
        evictIfNeeded()
        return value
      })
      .catch((error) => {
        const current = entries.get(key)
        if (current?.promise === promise) {
          if (current.value !== undefined && current.staleExpiresAt > Date.now()) {
            delete current.promise
            entries.set(key, current)
          } else {
            entries.delete(key)
          }
        }
        throw error
      })

    entry.promise = promise
    entries.set(key, entry)
    evictIfNeeded()

    return promise
  }

  return {
    async getOrSet(key: string, loader: () => Promise<V>) {
      const now = Date.now()
      pruneExpired(now)

      const existing = entries.get(key)
      if (existing) {
        if (existing.value !== undefined && existing.expiresAt > now) {
          touch(key, existing)
          return existing.value
        }

        if (existing.value !== undefined && existing.staleExpiresAt > now) {
          if (!existing.promise) {
            void startLoad(key, existing, loader).catch(() => undefined)
          }
          touch(key, existing)
          return existing.value
        }

        if (existing.promise) {
          return existing.promise
        }

        entries.delete(key)
      }

      const entry: CacheEntry<V> = {
        expiresAt: now + options.ttlMs,
        staleExpiresAt: now + options.ttlMs + staleWhileRevalidateMs,
      }

      return startLoad(key, entry, loader)
    },

    delete(key: string) {
      entries.delete(key)
    },

    clear() {
      entries.clear()
    },

    size() {
      return entries.size
    },
  }
}
