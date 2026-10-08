// All Supabase data access lives here so screens never build queries directly.
import { supabase } from './supabase'
import type { BookDetails, BookPageData, CatalogBook, ManualBookInput, ReadingStatus, ShelfEntry } from './types'

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

/** Search our own catalog first, then Open Library (via Edge Function); local matches come first. */
export async function searchBooks(query: string): Promise<CatalogBook[]> {
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`)
  const [local, remote] = await Promise.all([
    supabase.from('books').select(BOOK_WITH_AUTHORS).ilike('title', `%${escaped}%`).limit(10),
    supabase.functions.invoke<{ results: CatalogBook[] }>('search-books', { body: { query } }),
  ])
  if (local.error) throw local.error

  const localBooks = (local.data as unknown as BookRow[]).map(rowToCatalogBook)
  const seen = new Set(localBooks.flatMap((b) => [b.open_library_id, b.isbn_13]).filter(Boolean))
  const remoteBooks = (remote.data?.results ?? []).filter(
    (b) => !seen.has(b.open_library_id) && !(b.isbn_13 && seen.has(b.isbn_13)),
  )
  if (remote.error && localBooks.length === 0) throw remote.error
  return [...localBooks, ...remoteBooks]
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

/** Load everything the book page shows. `routeId` is an Open Library work id or one of our book ids. */
export async function getBookPage(routeId: string): Promise<BookPageData> {
  const byOurId = UUID.test(routeId)
  const { data: row, error } = await supabase
    .from('books')
    .select(BOOK_WITH_AUTHORS)
    .eq(byOurId ? 'id' : 'open_library_id', byOurId ? routeId : `/works/${routeId}`)
    .maybeSingle()
  if (error) throw error
  const localRow = row as unknown as BookRow | null
  const local = localRow
    ? { ...rowToCatalogBook(localRow), id: localRow.id, description: localRow.description, source: localRow.source }
    : null

  const olId = local?.open_library_id ?? (byOurId ? null : `/works/${routeId}`)
  const [details, entry] = await Promise.all([
    olId
      ? supabase.functions.invoke<BookDetails>('book-details', { body: { open_library_id: olId } })
      : Promise.resolve(null),
    local
      ? supabase.from('user_books').select('id, status, rating').eq('book_id', local.id).maybeSingle()
      : Promise.resolve(null),
  ])
  if (entry?.error) throw entry.error

  return {
    local,
    details: details?.data ?? null,
    detailsError: details?.error ? 'Couldn’t load full details from Open Library.' : null,
    entry: (entry?.data as BookPageData['entry']) ?? null,
  }
}
