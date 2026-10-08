// Pure helpers that turn Open Library's raw JSON into the app's BookDetails shape.
// Kept free of Deno APIs so they can be unit-tested with plain Node.

import { normalizeSeriesName, parseSeries, type SeriesInfo } from '../_shared/series.ts'

export { parseSeries, type SeriesInfo }

export interface OLText {
  type?: string
  value: string
}

// Open Library records are hand-edited and vary in shape (a field may be a string, a list,
// an object, or missing), so every field we read is typed `unknown` and checked before use.

export interface OLWork {
  key: string
  title?: unknown
  subtitle?: unknown
  description?: unknown
  authors?: unknown
  subjects?: unknown
  first_publish_date?: unknown
  covers?: unknown
  series?: unknown
}

export interface OLEdition {
  key: string
  title?: unknown
  subtitle?: unknown
  publishers?: unknown
  publish_date?: unknown
  number_of_pages?: unknown
  isbn_13?: unknown
  isbn_10?: unknown
  physical_format?: unknown
  languages?: unknown
  covers?: unknown
  series?: unknown
}

export interface OLAuthor {
  key: string
  name?: unknown
  personal_name?: unknown
  bio?: unknown
  birth_date?: unknown
  death_date?: unknown
}

/** A non-empty string, or null. */
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** A positive number (also accepts numeric strings), or null. */
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
/** Items of a list field (or a single value treated as a one-item list). */
const items = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])
const strings = (v: unknown): string[] => items(v).flatMap((x) => (str(x) ? [str(x)!] : []))
const numbers = (v: unknown): number[] => items(v).flatMap((x) => (num(x) ? [num(x)!] : []))
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

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
export function cleanText(text: unknown): string | null {
  const raw = str(text) ?? str(obj(text)?.value)
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

/** A series entry stored as a structured record rather than text. */
export interface SeriesRef {
  key: string | null // e.g. "/series/OL123L", to look up the name
  name: string | null
  position: string | null
}

/**
 * Split a `series` field into text entries ("Dune Chronicles ; 1") and structured
 * entries (newer records link to a series record, e.g. { series: { key }, position }).
 */
export function seriesEntries(v: unknown): { text: string[]; refs: SeriesRef[] } {
  const text: string[] = []
  const refs: SeriesRef[] = []
  for (const item of items(v)) {
    if (str(item)) {
      text.push(str(item)!)
      continue
    }
    const o = obj(item)
    if (!o) continue
    const inner = obj(o.series) ?? obj(o.work) ?? o
    const name = str(o.name) ?? str(o.title) ?? str(inner.name) ?? str(inner.title)
    const key = str(inner.key) ?? str(o.key)
    const pos = o.position ?? o.number ?? o.index ?? inner.position
    const position = str(pos) ?? (num(pos) ? String(num(pos)) : null)
    if (name || key) refs.push({ key: key && key.includes('/series/') ? key : null, name, position })
  }
  return { text, refs }
}

/** The first structured series entry on a work (preferred over guesses from edition text). */
export function structuredSeriesRef(work: OLWork): SeriesRef | null {
  return seriesEntries(work.series).refs[0] ?? null
}

/** Pick the series name most editions agree on, and the most common number for it. */
export function pickSeries(work: OLWork, editions: OLEdition[]): SeriesInfo | null {
  const all = [work.series, ...editions.map((e) => e.series)].map(seriesEntries)
  const parsed = [
    ...all.flatMap((e) => e.text).map(parseSeries),
    ...all.flatMap((e) => e.refs).flatMap((r) => (r.name ? [{ name: r.name, number: r.position }] : [])),
  ].filter((x): x is SeriesInfo => x !== null)
  if (parsed.length === 0) return null

  const byName = new Map<string, { name: string; count: number; numbers: Map<string, number> }>()
  for (const s of parsed) {
    const k = normalizeSeriesName(s.name)
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

/** Author record keys on a work ("/authors/OL…A"); entries are { author: { key } } or { key }. */
export function authorKeys(work: OLWork): string[] {
  return items(work.authors)
    .flatMap((a) => {
      const key = str(obj(obj(a)?.author)?.key) ?? str(obj(a)?.key)
      return key && key.startsWith('/authors/') ? [key] : []
    })
    .slice(0, 5)
}

/** Dates are usually text ("May 5, 2015") but sometimes a bare number (2015). */
const dateText = (v: unknown): string | null => str(v) ?? (typeof v === 'number' && Number.isFinite(v) ? String(v) : null)
const yearOf = (date: unknown) => Number(dateText(date)?.match(/\d{4}/)?.[0] ?? 0)

const languageOf = (e: OLEdition) => str(obj(items(e.languages)[0])?.key)?.split('/').pop() ?? null
const isAudio = (e: OLEdition) => /audio|\bcd\b|mp3|cassette/i.test(str(e.physical_format) ?? '')

/**
 * The cover of the most recent edition that has one, so the book looks like what's in
 * shops now. Skips audiobooks (square/odd covers) and editions in a different language
 * from most of the book's editions. Falls back to Open Library's default cover.
 */
export function pickCover(work: OLWork, editions: OLEdition[]): string | null {
  const counts = new Map<string, number>()
  for (const e of editions) {
    const lang = languageOf(e)
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  const mainLanguage = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const newest = editions
    .filter((e) => numbers(e.covers).length > 0 && !isAudio(e))
    .filter((e) => !mainLanguage || !languageOf(e) || languageOf(e) === mainLanguage)
    .sort((a, b) => yearOf(b.publish_date) - yearOf(a.publish_date))[0]
  return coverUrl(newest ? numbers(newest.covers)[0] : undefined, 'L') ?? coverUrl(numbers(work.covers)[0], 'L')
}

export function normalizeEdition(e: OLEdition): Edition {
  const lang = languageOf(e)
  const isbn = (v: unknown) => strings(v)[0]?.replace(/-/g, '') ?? null
  return {
    key: e.key,
    title: [str(e.title), str(e.subtitle)].filter(Boolean).join(': ') || 'Untitled edition',
    publisher: strings(e.publishers)[0] ?? null,
    publish_date: dateText(e.publish_date),
    page_count: num(e.number_of_pages),
    format: str(e.physical_format),
    language: lang ? (LANGUAGES[lang] ?? lang) : null,
    isbn_13: isbn(e.isbn_13),
    isbn_10: isbn(e.isbn_10),
    cover_url: coverUrl(numbers(e.covers)[0], 'S'),
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
  structuredSeries: SeriesInfo | null = null, // from a linked series record, if any
  maxEditions = 50,
): BookDetails {
  const editionList = editions.filter((e) => obj(e) && str(e.key))
  const firstYear = Math.min(...editionList.map((e) => yearOf(e.publish_date)).filter((y) => y > 0))
  return {
    open_library_id: work.key,
    title: str(work.title) ?? 'Untitled',
    subtitle: str(work.subtitle),
    description: cleanText(work.description),
    authors: authors.map((a) => ({
      key: a.key,
      name: str(a.name) ?? str(a.personal_name) ?? 'Unknown author',
      birth_date: dateText(a.birth_date),
      death_date: dateText(a.death_date),
      bio: cleanText(a.bio),
    })),
    series: structuredSeries ?? pickSeries(work, editionList),
    first_published: dateText(work.first_publish_date) ?? (Number.isFinite(firstYear) ? String(firstYear) : null),
    page_count: median(editionList.flatMap((e) => (num(e.number_of_pages) ? [num(e.number_of_pages)!] : []))),
    subjects: strings(work.subjects).filter((s) => s.length <= 40).slice(0, 12),
    cover_url: pickCover(work, editionList),
    edition_count: editionCount,
    editions: [...editionList]
      .sort((a, b) => yearOf(b.publish_date) - yearOf(a.publish_date))
      .slice(0, maxEditions)
      .map(normalizeEdition),
  }
}
