export type ReadingStatus = 'want_to_read' | 'reading' | 'read'

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  want_to_read: 'Want to read',
  reading: 'Reading',
  read: 'Read',
}

export interface SearchResult {
  openLibraryKey: string
  title: string
  authors: string[]
  coverId: number | null
  firstPublishYear: number | null
}

export interface PileBook {
  id: string
  open_library_key: string
  title: string
  authors: string[]
  cover_id: number | null
  first_publish_year: number | null
  status: ReadingStatus
  rating: number | null
  created_at: string
}
