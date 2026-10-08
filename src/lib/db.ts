// All Supabase data access lives here so screens never build queries directly.
import { supabase } from './supabase'
import { isFresh, normalizeQuery, TTL_DAYS } from '../../supabase/functions/_shared/cache'
import { normalizeSeriesName } from '../../supabase/functions/_shared/series'
import { memoAsync } from './memory'
import type { BookDetails, BookLocalData, CatalogBook, ManualBookInput, ReadingStatus, SeriesBook, ShelfEntry } from './types'

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
  if (error) throw error
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

export async function getShelf(): Promise<ShelfEntry[]> {
  const { data, error } = await supabase
    .from('user_books')
    .select(`id, status, rating, created_at, book:books ( id, open_library_id, title, cover_url, book_authors ( position, author:authors ( name ) ) )`)
    .order('created_at', { ascending: false })
  if (error) throw error
  type Row = Omit<ShelfEntry, 'book'> & {
    book: Pick<BookRow, 'id' | 'open_library_id' | 'title' | 'cover_url' | 'book_authors'>
  }
  return (data as unknown as Row[]).map((row) => ({
    ...row,
    book: {
      id: row.book.id,
      open_library_id: row.book.open_library_id,
      title: row.book.title,
      cover_url: row.book.cover_url,
      authors: authorNames(row.book),
    },
  }))
}

/** Changing status away from "read" clears the rating (done by a database trigger). */
export async function updateShelfEntry(
  id: string,
  changes: { status?: ReadingStatus; rating?: number | null },
): Promise<void> {
  const { error } = await supabase.from('user_books').update(changes).eq('id', id)
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
      if (!r) return { local: null, entry: null }
      const { data: entry, error: entryError } = await supabase
        .from('user_books')
        .select('id, status, rating')
        .eq('book_id', r.id)
        .maybeSingle()
      if (entryError) throw entryError
      return {
        local: { ...rowToCatalogBook(r), id: r.id, description: r.description, source: r.source },
        entry: (entry as BookLocalData['entry']) ?? null,
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
      throw error
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
function getSeriesBooks(name: string, authorKey: string): Promise<SeriesBook[]> {
  const author = authorKey.match(/OL\d+A/)?.[0] ?? authorKey
  const nameKey = normalizeSeriesName(name)
  return seriesCache.load(`${nameKey}|${author}`, async () => {
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
    if (error) throw error
    return data?.books ?? []
  })
}

export async function getSeries(name: string, authorKey: string): Promise<SeriesPageData> {
  const [books, shelf] = await Promise.all([getSeriesBooks(name, authorKey), getShelf()])
  const statuses = new Map<string, ReadingStatus>()
  for (const entry of shelf) if (entry.book.open_library_id) statuses.set(entry.book.open_library_id, entry.status)
  return { books, statuses }
}
