// One way to call Open Library from every Edge Function: retries with backoff on
// rate limits (429) and server errors, a per-request timeout, and results that tell
// "not found" apart from "Open Library is busy". Uses only fetch, so Node can test it.

export type OLResult<T> =
  | { ok: true; data: T }
  | { ok: false; notFound: boolean; status: number | null; message: string }

export interface OLFetchOptions {
  retries?: number // extra attempts after the first
  timeoutMs?: number
  baseDelayMs?: number
  headers?: Record<string, string>
  sleep?: (ms: number) => Promise<void> // injectable for tests
}

const OL = 'https://openlibrary.org'
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const MAX_RETRY_AFTER_MS = 4000

/**
 * Open Library asks API users to identify themselves; with a contact address it allows
 * a higher request rate. Set the OPEN_LIBRARY_CONTACT secret (an email or URL) to send one.
 */
export function olHeaders(contact?: string | null): Record<string, string> {
  return { 'User-Agent': `HippocampusBooks/0.2 (${contact?.trim() || 'book tracker app'})` }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function olGetJson<T>(path: string, opts: OLFetchOptions = {}): Promise<OLResult<T>> {
  const { retries = 2, timeoutMs = 8000, baseDelayMs = 400, headers = olHeaders(), sleep = defaultSleep } = opts
  let last: OLResult<T> = { ok: false, notFound: false, status: null, message: 'No attempt made' }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let retryAfterMs: number | null = null
    try {
      const res = await fetch(`${OL}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return { ok: true, data: (await res.json()) as T }
      if (res.status === 404) return { ok: false, notFound: true, status: 404, message: 'Not found on Open Library' }
      last = { ok: false, notFound: false, status: res.status, message: `Open Library returned ${res.status}` }
      if (!RETRYABLE.has(res.status)) return last
      const ra = Number(res.headers.get('retry-after'))
      if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, MAX_RETRY_AFTER_MS)
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      last = {
        ok: false,
        notFound: false,
        status: null,
        message: timedOut ? 'Open Library took too long to respond' : 'Could not reach Open Library',
      }
    }
    if (attempt < retries) await sleep(retryAfterMs ?? baseDelayMs * 3 ** attempt) // 400ms, 1.2s, …
  }
  return last
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}
