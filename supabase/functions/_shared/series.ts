// Series helpers shared by Edge Functions. Free of Deno APIs so they can be unit-tested with Node.
// Open Library has no real series field; editions carry free-text strings like
// "Dune Chronicles ; 1", "Harry Potter (1)" or "The Wheel of Time, Book 1".

export interface SeriesInfo {
  name: string
  number: string | null
}

/**
 * Parse an edition's series string, e.g. "Dune Chronicles ; 1", "Harry Potter (1)",
 * "The Wheel of Time, Book 1", "Discworld #1", "Dune chronicles -- bk. 1".
 */
export function parseSeries(raw: string): SeriesInfo | null {
  const s = raw.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim()
  if (!s) return null
  // A number only counts as a series position after a real separator, so "Catch-22" stays a title.
  const m = s.match(
    /^(.*?)(?:\s*[,;:(]\s*|\s+[–—-]*\s*|\s*#\s*)(?:(?:book|bk\.?|vol\.?|volume|no\.?|number|part|tome)\s*#?\s*)?(\d+(?:\.\d+)?)\s*\)?$/i,
  )
  const clean = (name: string) => name.replace(/[\s,;:(#–—-]+$/, '').trim()
  if (m && clean(m[1])) return { name: clean(m[1]), number: m[2] }
  return { name: clean(s), number: null }
}

/**
 * A comparison key for series names, so "The Dune Chronicles", "Dune chronicles" and
 * "Dune series" all match. Generic words like "series" or "trilogy" are dropped.
 */
export function normalizeSeriesName(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(/\b(series|saga|trilogy|sequence|cycle|chronicles|novels?|books?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return key || name.toLowerCase().trim()
}

/**
 * Given a work's edition series strings, the most common position number among those
 * naming the target series. Returns undefined if none of them name it, null if they
 * do but never give a number.
 */
export function positionInSeries(seriesStrings: string[], target: string): string | null | undefined {
  const key = normalizeSeriesName(target)
  const counts = new Map<string, number>()
  let mentioned = false
  for (const raw of seriesStrings) {
    const s = parseSeries(raw)
    if (!s || normalizeSeriesName(s.name) !== key) continue
    mentioned = true
    if (s.number) counts.set(s.number, (counts.get(s.number) ?? 0) + 1)
  }
  if (!mentioned) return undefined
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
