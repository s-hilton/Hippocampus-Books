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
export type TagKind = 'trope' | 'content_warning'

/** A trope or content warning from the fixed lists. Identified by (kind, slug). */
export interface Tag {
  kind: TagKind
  slug: string
  name: string
  category: string
  isNew?: boolean // typed by the reader in the review form; created (or matched) on save
}

/** A tag with how many readers picked it for a book. */
export interface TagCount extends Tag {
  readers: number
}

/** A user's review of a book: stars are required; text, tropes and warnings are optional. */
export interface Review {
  id: string
  book_id: string
  rating: number
  body: string | null
  updated_at: string
  tropes: Tag[]
  warnings: Tag[]
}

export interface ShelfEntry {
  id: string
  status: ReadingStatus
  review: Review | null
  created_at: string
  book: {
    id: string
    open_library_id: string | null
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

/** Full details for one book, from the `book-details` Edge Function (Open Library). */
export interface AuthorDetails {
  key: string
  name: string
  birth_date: string | null
  death_date: string | null
  bio: string | null
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

/** Our catalog row for a book (if we have one) and the user's shelf entry for it. */
export interface BookLocalData {
  local: (CatalogBook & { id: string; description: string | null; source: string }) | null
  entry: Pick<ShelfEntry, 'id' | 'status'> | null
  review: Review | null
}

/** One book in a series, from the `series-books` Edge Function. */
export interface SeriesBook {
  open_library_id: string
  title: string
  cover_url: string | null
  first_published: string | null
  number: string | null
}
