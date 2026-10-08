// Small in-memory caches that make navigation feel instant within a session.
// Everything here is a copy of data that lives in the database; it's safe to lose.

/** What a list row already knows about a book. */
export interface BookPreview {
  open_library_id: string | null
  title: string
  authors: string[]
  cover_url: string | null
}

const previews = new Map<string, BookPreview>()

export function rememberPreview(routeId: string, preview: BookPreview) {
  previews.set(routeId, {
    open_library_id: preview.open_library_id,
    title: preview.title,
    authors: preview.authors,
    cover_url: preview.cover_url,
  })
}

export function getPreview(routeId: string): BookPreview | undefined {
  return previews.get(routeId)
}

/**
 * Memoize an async loader by key: concurrent and repeated calls share one result, so a
 * prefetch started on press-in is reused by the screen. Failed loads aren't kept.
 */
export function memoAsync<T>() {
  const values = new Map<string, T>()
  const inFlight = new Map<string, Promise<T>>()
  return {
    peek: (key: string) => values.get(key),
    clear: (key: string) => values.delete(key),
    set: (key: string, value: T) => values.set(key, value),
    load(key: string, loader: () => Promise<T>, { refresh = false } = {}): Promise<T> {
      const pending = inFlight.get(key)
      if (pending) return pending
      if (!refresh && values.has(key)) return Promise.resolve(values.get(key) as T)
      const p = loader()
        .then((v) => {
          values.set(key, v)
          return v
        })
        .finally(() => inFlight.delete(key))
      inFlight.set(key, p)
      return p
    },
  }
}
