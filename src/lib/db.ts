// All Supabase data access lives here so screens never build queries directly.
import { supabase } from './supabase'
import { isFresh, normalizeQuery, TTL_DAYS } from '../../supabase/functions/_shared/cache'
import { normalizeSeriesName } from '../../supabase/functions/_shared/series'
import { memoAsync } from './memory'
import type {
  BookDetails,
  BookLocalData,
  CatalogBook,
  ManualBookInput,
  ProgressPoint,
  Read,
  ReadDetail,
  ReadingStatus,
  Review,
  SeriesBook,
  Tag,
  TagCount,
  ShelfEntry,
} from './types'

/**
 * Edge Function errors from supabase-js have a generic message ("non-2xx status code");
 * our functions put a readable reason in the response body, so surface that instead.
 */
async function functionError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    let detail = ''
    try {
      const body = (await context.clone().json()) as { error?: string; message?: string; msg?: string }
      if (body.error) return new Error(body.error)
      detail = body.message ?? body.msg ?? ''
    } catch {
      // not JSON; fall through
    }
    // Not one of our functions' messages (e.g. the function isn't deployed, or the
    // gateway rejected the request): include what Supabase said, to make it diagnosable.
    return new Error(`Couldn’t reach the book service (${context.status}${detail ? `: ${detail}` : ''}).`)
  }
  const reason = error instanceof Error && error.message ? `: ${error.message}` : ''
  return new Error(`Couldn’t reach the book service${reason}. Check your connection and try again.`)
}

const BOOK_WITH_AUTHORS = `
  id, title, subtitle, description, source, cover_url, published_date, page_count, isbn_13, isbn_10, open_library_id,
  book_authors ( position, author:authors ( name ) )
`

interface BookRow {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  source: string
  cover_url: string | null
  published_date: string | null
  page_count: number | null
  isbn_13: string | null
  isbn_10: string | null
  open_library_id: string | null
  book_authors: { position: number; author: { name: string } | null }[]
}

function authorNames(row: Pick<BookRow, 'book_authors'>): string[] {
  return [...row.book_authors]
    .sort((a, b) => a.position - b.position)
    .flatMap((ba) => (ba.author ? [ba.author.name] : []))
}

function rowToCatalogBook(row: BookRow): CatalogBook {
  const { book_authors: _, description: _d, source: _s, ...rest } = row
  return { ...rest, authors: authorNames(row) }
}

/** Search our own catalog. Fast: answers from the database only. */
export async function searchCatalog(query: string): Promise<CatalogBook[]> {
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await supabase.from('books').select(BOOK_WITH_AUTHORS).ilike('title', `%${escaped}%`).limit(10)
  if (error) throw error
  return (data as unknown as BookRow[]).map(rowToCatalogBook)
}

/**
 * Search Open Library. Uses a saved result from search_cache when one is fresh (a quick
 * database read); otherwise calls the search-books Edge Function, which also saves the
 * result and adds every book to our catalog for next time.
 */
export async function searchOpenLibrary(query: string): Promise<CatalogBook[]> {
  const { data: saved } = await supabase
    .from('search_cache')
    .select('results, fetched_at')
    .eq('query_key', normalizeQuery(query))
    .maybeSingle()
  if (saved) {
    const results = saved.results as CatalogBook[]
    if (isFresh(saved.fetched_at, results.length > 0 ? TTL_DAYS.search : TTL_DAYS.empty)) return results
  }
  const { data, error } = await supabase.functions.invoke<{ results: CatalogBook[] }>('search-books', { body: { query } })
  if (error) throw await functionError(error)
  return data?.results ?? []
}

/** Catalog matches first, then Open Library results that aren't already among them. */
export function mergeSearchResults(local: CatalogBook[], remote: CatalogBook[]): CatalogBook[] {
  const seen = new Set(local.flatMap((b) => [b.open_library_id, b.isbn_13]).filter(Boolean))
  return [...local, ...remote.filter((b) => !seen.has(b.open_library_id) && !(b.isbn_13 && seen.has(b.isbn_13)))]
}

/** Find-or-create the book (de-duplicated server-side, matching on id, Open Library id, then ISBN) and put it on the user's shelf. */
export async function addBookToPile(book: CatalogBook): Promise<string> {
  const { data, error } = await supabase.rpc('add_book_to_pile', { p_book: book })
  if (error) throw error
  return data as string
}

export async function addManualBook(input: ManualBookInput): Promise<string> {
  const isbn = input.isbn.replace(/[^0-9Xx]/g, '').toUpperCase()
  const { data, error } = await supabase.rpc('add_book_to_pile', {
    p_book: {
      title: input.title,
      authors: input.authors,
      isbn_13: isbn.length === 13 ? isbn : null,
      isbn_10: isbn.length === 10 ? isbn : null,
      page_count: input.page_count,
      published_date: input.published_date,
    },
  })
  if (error) throw error
  return data as string
}

/** Identifiers of books on the user's shelf, for showing "In pile" on search results. */
export async function getPileKeys(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_books')
    .select('book:books ( id, open_library_id, isbn_13 )')
  if (error) throw error
  const keys = new Set<string>()
  for (const row of data as unknown as { book: Pick<BookRow, 'id' | 'open_library_id' | 'isbn_13'> | null }[]) {
    if (!row.book) continue
    keys.add(row.book.id)
    if (row.book.open_library_id) keys.add(row.book.open_library_id)
    if (row.book.isbn_13) keys.add(row.book.isbn_13)
  }
  return keys
}

export function isInPile(book: CatalogBook, keys: Set<string>): boolean {
  return [book.id, book.open_library_id, book.isbn_13].some((k) => k && keys.has(k))
}

const tagsCache = memoAsync<{ tropes: Tag[]; warnings: Tag[] }>()

const REVIEW_FIELDS = 'id, book_id, rating, body, updated_at, review_tags ( tag:tags ( kind, slug, name, category ) )'

type ReviewRow = Omit<Review, 'tropes' | 'warnings'> & { review_tags: { tag: Tag | null }[] }

function toReview(row: ReviewRow): Review {
  const tags = row.review_tags.flatMap((rt) => (rt.tag ? [rt.tag] : []))
  const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name)
  const { review_tags: _, ...rest } = row
  return {
    ...rest,
    tropes: tags.filter((t) => t.kind === 'trope').sort(byName),
    warnings: tags.filter((t) => t.kind === 'content_warning').sort(byName),
  }
}

const READ_FIELDS = 'id, book_id, status, started_at, finished_at, current_page, page_count, progress_unit'

/** Oldest first; a read with no start date sorts by when it finished. */
function byStart(a: Read, b: Read): number {
  return (a.started_at ?? a.finished_at ?? '').localeCompare(b.started_at ?? b.finished_at ?? '')
}

export async function getShelf(): Promise<ShelfEntry[]> {
  const [shelf, reviews, reads] = await Promise.all([
    supabase
      .from('user_books')
      .select(`id, status, created_at, book:books ( id, open_library_id, title, cover_url, book_authors ( position, author:authors ( name ) ) )`)
      .order('created_at', { ascending: false }),
    supabase.from('reviews').select(REVIEW_FIELDS), // RLS: only the user's own
    supabase.from('reads').select(READ_FIELDS), // RLS: only the user's own
  ])
  if (shelf.error) throw shelf.error
  if (reviews.error) throw reviews.error
  if (reads.error) throw reads.error
  const reviewByBook = new Map((reviews.data as unknown as ReviewRow[]).map((r) => [r.book_id, toReview(r)]))
  const openByBook = new Map<string, Read>()
  const finishedByBook = new Map<string, number>()
  for (const read of reads.data as Read[]) {
    if (read.status === 'reading') openByBook.set(read.book_id, read)
    if (read.status === 'read') finishedByBook.set(read.book_id, (finishedByBook.get(read.book_id) ?? 0) + 1)
  }
  type Row = Omit<ShelfEntry, 'book' | 'review' | 'currentRead' | 'timesRead'> & {
    book: Pick<BookRow, 'id' | 'open_library_id' | 'title' | 'cover_url' | 'book_authors'>
  }
  return (shelf.data as unknown as Row[]).map((row) => ({
    ...row,
    review: reviewByBook.get(row.book.id) ?? null,
    currentRead: openByBook.get(row.book.id) ?? null,
    timesRead: finishedByBook.get(row.book.id) ?? 0,
    book: {
      id: row.book.id,
      open_library_id: row.book.open_library_id,
      title: row.book.title,
      cover_url: row.book.cover_url,
      authors: authorNames(row.book),
    },
  }))
}

/** Change a book's shelf status. The database starts, closes or reopens its read to match. */
export async function updateShelfEntry(id: string, changes: { status: ReadingStatus }): Promise<void> {
  const { error } = await supabase.from('user_books').update(changes).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Reads and reading progress
// ---------------------------------------------------------------------------

/** Mark a book on the pile Read (from a screen that knows the book, not the shelf entry). */
export async function markBookRead(bookId: string): Promise<void> {
  const { error } = await supabase.from('user_books').update({ status: 'read' }).eq('book_id', bookId)
  if (error) throw error
}

/** Start another read of a book on the pile (a reread); sets its status to Reading. */
export async function startReread(bookId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_reread', { p_book_id: bookId })
  if (error) throw error
  return data as string
}

/**
 * Log how far a read in progress is, for its chart: a page (with the edition's page count,
 * if known) or, for a read without a page count, a percent.
 */
export async function logProgress(
  readId: string,
  progress: { unit: 'pages'; page: number; pageCount: number | null } | { unit: 'percent'; percent: number },
): Promise<Read> {
  const { error } = await supabase.rpc(
    'log_progress',
    progress.unit === 'pages'
      ? { p_read_id: readId, p_page: progress.page, p_page_count: progress.pageCount, p_unit: 'pages' }
      : { p_read_id: readId, p_page: progress.percent, p_unit: 'percent' },
  )
  if (error) throw error
  const { data, error: readError } = await supabase.from('reads').select(READ_FIELDS).eq('id', readId).single()
  if (readError) throw readError
  return data as Read
}

/** All reads of one book, oldest first. */
async function getReadsForBook(bookId: string): Promise<Read[]> {
  const { data, error } = await supabase.from('reads').select(READ_FIELDS).eq('book_id', bookId)
  if (error) throw error
  return (data as Read[]).sort(byStart)
}

/** One read with its progress log and book, for the read page. */
export async function getRead(id: string): Promise<ReadDetail | null> {
  const { data, error } = await supabase
    .from('reads')
    .select(`${READ_FIELDS}, book:books ( id, open_library_id, title, cover_url, book_authors ( position, author:authors ( name ) ) )`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as Read & { book: Pick<BookRow, 'id' | 'open_library_id' | 'title' | 'cover_url' | 'book_authors'> }
  const [progress, siblings] = await Promise.all([
    supabase.from('reading_progress').select('id, page, logged_at').eq('read_id', id).order('logged_at'),
    getReadsForBook(row.book_id),
  ])
  if (progress.error) throw progress.error
  const { book, ...read } = row
  return {
    ...read,
    progress: progress.data as ProgressPoint[],
    number: siblings.findIndex((r) => r.id === id) + 1,
    total: siblings.length,
    book: {
      id: book.id,
      open_library_id: book.open_library_id,
      title: book.title,
      cover_url: book.cover_url,
      authors: authorNames(book),
    },
  }
}

/** Correct when a read started or finished (null start = not recorded). */
export async function updateReadDates(
  id: string,
  dates: { started_at: string | null; finished_at: string | null },
): Promise<void> {
  const { error } = await supabase.from('reads').update(dates).eq('id', id)
  if (error) throw error
}

/** Delete a finished read and its progress log (e.g. one recorded by mistake). */
export async function deleteRead(id: string): Promise<void> {
  const { error } = await supabase.from('reads').delete().eq('id', id).neq('status', 'reading')
  if (error) throw error
}

/**
 * Save a review with its tropes and content warnings, in one step (the save_review
 * database function). Creates the review if there isn't one (only allowed for books
 * marked Read), otherwise updates it and replaces its tags.
 */
export async function saveReview(input: {
  bookId: string
  rating: number
  body: string
  tropes: Tag[]
  warnings: Tag[]
}): Promise<Review> {
  const existing = (tags: Tag[]) => tags.filter((t) => !t.isNew).map((t) => t.slug)
  const typed = (tags: Tag[]) => tags.filter((t) => t.isNew).map((t) => t.name)
  const { data: id, error } = await supabase.rpc('save_review', {
    p_book_id: input.bookId,
    p_rating: input.rating,
    p_body: input.body,
    p_tropes: existing(input.tropes),
    p_warnings: existing(input.warnings),
    p_new_tropes: typed(input.tropes),
    p_new_warnings: typed(input.warnings),
  })
  if (error) throw error
  // New tags were created (or matched): reload the lists next time so they appear.
  if ([...input.tropes, ...input.warnings].some((t) => t.isNew)) tagsCache.clear('all')
  const { data, error: readError } = await supabase.from('reviews').select(REVIEW_FIELDS).eq('id', id).single()
  if (readError) throw readError
  return toReview(data as unknown as ReviewRow)
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', id)
  if (error) throw error
}

export async function removeFromShelf(id: string): Promise<void> {
  const { error } = await supabase.from('user_books').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Book page
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The `/book/[id]` route param for a book: its Open Library work id (e.g. "OL45804W")
 * when it has one, otherwise our own books.id.
 */
export function bookRouteId(book: { id?: string; open_library_id: string | null }): string {
  return book.open_library_id?.split('/').pop() ?? book.id ?? ''
}

/** The Open Library work key for a route id, if the id is one (e.g. "OL45804W" → "/works/OL45804W"). */
export function workKeyFromRouteId(routeId: string): string | null {
  return /^OL\d+W$/.test(routeId) ? `/works/${routeId}` : null
}

const localCache = memoAsync<BookLocalData>()
const detailsCache = memoAsync<BookDetails | null>()

/** Our catalog row for the book (if any) and the user's shelf entry. Quick: database only. */
export function getBookLocal(routeId: string, opts?: { refresh?: boolean }): Promise<BookLocalData> {
  return localCache.load(
    routeId,
    async () => {
      const byOurId = UUID.test(routeId)
      const { data: row, error } = await supabase
        .from('books')
        .select(BOOK_WITH_AUTHORS)
        .eq(byOurId ? 'id' : 'open_library_id', byOurId ? routeId : `/works/${routeId}`)
        .maybeSingle()
      if (error) throw error
      const r = row as unknown as BookRow | null
      if (!r) return { local: null, entry: null, review: null, reads: [] }
      const [entry, review, reads] = await Promise.all([
        supabase.from('user_books').select('id, status').eq('book_id', r.id).maybeSingle(),
        supabase.from('reviews').select(REVIEW_FIELDS).eq('book_id', r.id).maybeSingle(),
        getReadsForBook(r.id),
      ])
      if (entry.error) throw entry.error
      if (review.error) throw review.error
      return {
        local: { ...rowToCatalogBook(r), id: r.id, description: r.description, source: r.source },
        entry: (entry.data as BookLocalData['entry']) ?? null,
        review: review.data ? toReview(review.data as unknown as ReviewRow) : null,
        reads,
      }
    },
    opts,
  )
}

/** Cached result of getBookLocal, for drawing a page instantly before revalidating. */
export const peekBookLocal = (routeId: string) => localCache.peek(routeId)

/** Update the in-memory copy after a change on the book page, so returning to it is instant and correct. */
export function setBookLocal(routeId: string, data: BookLocalData) {
  localCache.set(routeId, data)
}

/**
 * Full Open Library details. Reads the saved copy in book_details when it's fresh (quick
 * database read); otherwise calls the book-details Edge Function, which saves it for everyone.
 */
export function getBookDetails(workKey: string): Promise<BookDetails | null> {
  return detailsCache.load(workKey, async () => {
    const { data: saved } = await supabase
      .from('book_details')
      .select('details, fetched_at')
      .eq('open_library_id', workKey)
      .maybeSingle()
    if (saved && isFresh(saved.fetched_at, TTL_DAYS.bookDetails)) return saved.details as BookDetails
    const { data, error } = await supabase.functions.invoke<BookDetails>('book-details', {
      body: { open_library_id: workKey },
    })
    if (error) {
      if (saved) return saved.details as BookDetails // stale beats nothing
      throw await functionError(error)
    }
    return data ?? null
  })
}

export const peekBookDetails = (workKey: string) => detailsCache.peek(workKey)

/** Start loading a book page's data before it's shown. Errors are left for the page to handle. */
export function prefetchBook(routeId: string) {
  const workKey = workKeyFromRouteId(routeId)
  getBookLocal(routeId)
    .then(({ local }) => {
      const key = workKey ?? local?.open_library_id
      if (key) return getBookDetails(key)
    })
    .catch(() => {})
  if (workKey) getBookDetails(workKey).catch(() => {})
}

// ---------------------------------------------------------------------------
// Series page
// ---------------------------------------------------------------------------

export interface SeriesPageData {
  books: SeriesBook[]
  /** The user's status for books in the series that are on their pile, keyed by Open Library id. */
  statuses: Map<string, ReadingStatus>
}

const seriesCache = memoAsync<SeriesBook[]>()

/** Books in a series: the saved list in series_lists if fresh, otherwise the series-books Edge Function. */
const seriesKey = (name: string, authorKey: string) =>
  `${normalizeSeriesName(name)}|${authorKey.match(/OL\d+A/)?.[0] ?? authorKey}`

function getSeriesBooks(name: string, authorKey: string): Promise<SeriesBook[]> {
  const author = authorKey.match(/OL\d+A/)?.[0] ?? authorKey
  const nameKey = normalizeSeriesName(name)
  return seriesCache.load(seriesKey(name, authorKey), async () => {
    const { data: saved } = await supabase
      .from('series_lists')
      .select('books, fetched_at')
      .eq('name_key', nameKey)
      .eq('author_key', author)
      .maybeSingle()
    if (saved) {
      const books = saved.books as SeriesBook[]
      if (isFresh(saved.fetched_at, books.length > 0 ? TTL_DAYS.series : TTL_DAYS.empty)) return books
    }
    const { data, error } = await supabase.functions.invoke<{ books: SeriesBook[] }>('series-books', {
      body: { name, author_key: authorKey },
    })
    if (error) throw await functionError(error)
    return data?.books ?? []
  })
}

/** Start loading a series list in the background (e.g. when its book page opens). */
export function prefetchSeries(name: string, authorKey: string) {
  getSeriesBooks(name, authorKey).catch(() => {}) // the series page will retry and show any error
}

/** The series list if it's already loaded, so the series page can draw it instantly. */
export const peekSeriesBooks = (name: string, authorKey: string) => seriesCache.peek(seriesKey(name, authorKey))

export async function getSeries(name: string, authorKey: string): Promise<SeriesPageData> {
  const [books, shelf] = await Promise.all([getSeriesBooks(name, authorKey), getShelf()])
  const statuses = new Map<string, ReadingStatus>()
  for (const entry of shelf) if (entry.book.open_library_id) statuses.set(entry.book.open_library_id, entry.status)
  return { books, statuses }
}

// ---------------------------------------------------------------------------
// Tropes and content warnings
// ---------------------------------------------------------------------------

const PAGE = 1000 // Supabase returns at most 1,000 rows per request by default

/** Every trope and content warning, in list order. Loaded once per session. */
export function getAllTags(): Promise<{ tropes: Tag[]; warnings: Tag[] }> {
  return tagsCache.load('all', async () => {
    const all: Tag[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('tags')
        .select('kind, slug, name, category')
        .order('kind')
        .order('position')
        .range(from, from + PAGE - 1)
      if (error) throw error
      all.push(...(data as Tag[]))
      if (data.length < PAGE) break
    }
    return {
      tropes: all.filter((t) => t.kind === 'trope'),
      warnings: all.filter((t) => t.kind === 'content_warning'),
    }
  })
}

/** How many readers picked each trope / content warning for a book, most picked first. */
export async function getCommunityTags(bookId: string): Promise<{ tropes: TagCount[]; warnings: TagCount[] }> {
  const { data, error } = await supabase.rpc('book_tag_counts', { p_book_id: bookId })
  if (error) throw error
  const rows = (data as (Tag & { readers: number | string })[]).map((r) => ({ ...r, readers: Number(r.readers) }))
  return {
    tropes: rows.filter((r) => r.kind === 'trope'),
    warnings: rows.filter((r) => r.kind === 'content_warning'),
  }
}
