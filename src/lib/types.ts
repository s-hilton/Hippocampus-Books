export type ReadingStatus = 'want_to_read' | 'reading' | 'read'

export const STATUSES: ReadingStatus[] = ['want_to_read', 'reading', 'read']

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  want_to_read: 'Want to read',
  reading: 'Reading',
  read: 'Read',
}

/** A book as shown in search results: either already in our `books` table or from Open Library. */
export interface CatalogBook {
  id?: string // set when the book is already in our database
  open_library_id: string | null
  title: string
  subtitle: string | null
  authors: string[]
  cover_url: string | null
  published_date: string | null
  page_count: number | null
  isbn_13: string | null
  isbn_10: string | null
}

/** A row on the user's shelf (`user_books`) with its book. */
export interface ShelfEntry {
  id: string
  status: ReadingStatus
  rating: number | null
  created_at: string
  book: {
    id: string
    title: string
    cover_url: string | null
    authors: string[]
  }
}

/** Fields for the manual "add a book" form. */
export interface ManualBookInput {
  title: string
  authors: string[]
  isbn: string
  page_count: number | null
  published_date: string
}
