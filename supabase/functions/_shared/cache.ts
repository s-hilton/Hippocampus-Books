// Freshness rules for saved Open Library data, shared by Edge Functions and the app.
// Free of Deno APIs (and imports) so the app can import it and Node can test it.

const DAY_MS = 24 * 60 * 60 * 1000

/** How long saved data is reused, in days. Empty results expire sooner (likely a temporary miss). */
export const TTL_DAYS = {
  bookDetails: 30,
  series: 30,
  search: 7,
  empty: 1,
} as const

/** Whether data saved at `fetchedAt` is still fresh. Future or unparseable timestamps count as stale. */
export function isFresh(fetchedAt: string, ttlDays: number, now = Date.now()): boolean {
  const age = now - new Date(fetchedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < ttlDays * DAY_MS
}

/** Cache key for a search, so "Dune ", "dune" and "DUNE" share one saved result. */
export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim()
}
