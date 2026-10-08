// Pure helpers that turn Open Library's raw JSON into the app's BookDetails shape.
// Kept free of Deno APIs so they can be unit-tested with plain Node.

export interface OLText {
  type?: string
  value: string
}

export interface OLWork {
  key: string
  title: string
  subtitle?: string
  description?: string | OLText
  authors?: { author?: { key: string } }[]
  subjects?: string[]
  first_publish_date?: string
  covers?: number[]
  series?: string[]
}

export interface OLEdition {
  key: string
  title?: string
  subtitle?: string
  publishers?: string[]
  publish_date?: string
  number_of_pages?: number
  isbn_13?: string[]
  isbn_10?: string[]
  physical_format?: string
  languages?: { key: string }[]
  covers?: number[]
  series?: string[]
}

export interface OLAuthor {
  key: string
  name?: string
  personal_name?: string
  bio?: string | OLText
  birth_date?: string
  death_date?: string
}

export interface Edition {
  key: string
  title: string
  publisher: string | null
  publish_date: string | null
  page_count: number | null
  format: string | null
  language: string | null
  isbn_13: string | null
  isbn_10: string | null
  cover_url: string | null
}

export interface AuthorDetails {
  key: string
  name: string
  birth_date: string | null
  death_date: string | null
  bio: string | null
}

export interface SeriesInfo {
  name: string
  number: string | null
}

export interface BookDetails {
  open_library_id: string
  title: string
  subtitle: string | null
  description: string | null
  authors: AuthorDetails[]
  series: SeriesInfo | null
  first_published: string | null
  page_count: number | null
  subjects: string[]
  cover_url: string | null
  edition_count: number
  editions: Edition[]
}

const LANGUAGES: Record<string, string> = {
  eng: 'English', spa: 'Spanish', fre: 'French', ger: 'German', ita: 'Italian', por: 'Portuguese',
  dut: 'Dutch', rus: 'Russian', jpn: 'Japanese', chi: 'Chinese', kor: 'Korean', ara: 'Arabic',
  pol: 'Polish', swe: 'Swedish', nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', tur: 'Turkish',
  gre: 'Greek', heb: 'Hebrew', hin: 'Hindi', cze: 'Czech', hun: 'Hungarian', rum: 'Romanian',
}

export const coverUrl = (id: number | undefined, size: 'S' | 'M' | 'L' = 'M') =>
  id && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : null

/** Open Library text fields are either plain strings or { type, value }; they often contain markdown links. */
export function cleanText(text: string | OLText | undefined): string | null {
  const raw = typeof text === 'string' ? text : text?.value
  if (!raw) return null
  const cleaned = raw
    .replace(/\r\n/g, '\n')
    .split(/\n-{3,}\s*\n/)[0] // drop trailing "----------" sections ("Also contained in", sources, ...)
    .replace(/\[([^\]]+)\]\[\d+\]/g, '$1') // [text][1]
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url)
    .replace(/^\s*\[\d+\]:\s*\S+\s*$/gm, '') // [1]: http://... reference lines
    .replace(/\(\s*(source|from)\s*:?[^)]*\)\s*$/i, '') // trailing "(Source: ...)"
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned || null
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

/** Pick the series name most editions agree on, and the most common number for it. */
export function pickSeries(work: OLWork, editions: OLEdition[]): SeriesInfo | null {
  const parsed = [...(work.series ?? []), ...editions.flatMap((e) => e.series ?? [])]
    .map(parseSeries)
    .filter((s): s is SeriesInfo => s !== null)
  if (parsed.length === 0) return null

  const byName = new Map<string, { name: string; count: number; numbers: Map<string, number> }>()
  for (const s of parsed) {
    const k = s.name.toLowerCase()
    const entry = byName.get(k) ?? { name: s.name, count: 0, numbers: new Map() }
    entry.count++
    if (s.number) entry.numbers.set(s.number, (entry.numbers.get(s.number) ?? 0) + 1)
    byName.set(k, entry)
  }
  // Prefer names that come with a number, then the most frequent.
  const best = [...byName.values()].sort(
    (a, b) => Number(b.numbers.size > 0) - Number(a.numbers.size > 0) || b.count - a.count,
  )[0]
  const number = [...best.numbers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { name: best.name, number }
}

const yearOf = (date: string | undefined) => Number(date?.match(/\d{4}/)?.[0] ?? 0)

export function normalizeEdition(e: OLEdition): Edition {
  const lang = e.languages?.[0]?.key.split('/').pop()
  return {
    key: e.key,
    title: [e.title, e.subtitle].filter(Boolean).join(': ') || 'Untitled edition',
    publisher: e.publishers?.[0] ?? null,
    publish_date: e.publish_date ?? null,
    page_count: e.number_of_pages ?? null,
    format: e.physical_format ?? null,
    language: lang ? (LANGUAGES[lang] ?? lang) : null,
    isbn_13: e.isbn_13?.[0]?.replace(/-/g, '') ?? null,
    isbn_10: e.isbn_10?.[0]?.replace(/-/g, '') ?? null,
    cover_url: coverUrl(e.covers?.find((c) => c > 0), 'S'),
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function buildDetails(
  work: OLWork,
  editions: OLEdition[],
  editionCount: number,
  authors: OLAuthor[],
  maxEditions = 50,
): BookDetails {
  const firstYear = Math.min(...editions.map((e) => yearOf(e.publish_date)).filter((y) => y > 0))
  return {
    open_library_id: work.key,
    title: work.title,
    subtitle: work.subtitle ?? null,
    description: cleanText(work.description),
    authors: authors.map((a) => ({
      key: a.key,
      name: a.name ?? a.personal_name ?? 'Unknown author',
      birth_date: a.birth_date ?? null,
      death_date: a.death_date ?? null,
      bio: cleanText(a.bio),
    })),
    series: pickSeries(work, editions),
    first_published: work.first_publish_date ?? (Number.isFinite(firstYear) ? String(firstYear) : null),
    page_count: median(editions.map((e) => e.number_of_pages ?? 0).filter((n) => n > 0)),
    subjects: (work.subjects ?? []).filter((s) => s.length <= 40).slice(0, 12),
    cover_url: coverUrl(work.covers?.find((c) => c > 0), 'L'),
    edition_count: editionCount,
    editions: [...editions]
      .sort((a, b) => yearOf(b.publish_date) - yearOf(a.publish_date))
      .slice(0, maxEditions)
      .map(normalizeEdition),
  }
}
