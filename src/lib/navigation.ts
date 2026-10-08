// Opening a book: remember what the list already knows (so the book page can show the
// title and cover instantly), start loading the rest, then navigate.
import { router } from 'expo-router'
import { bookRouteId, prefetchBook } from './db'
import { rememberPreview, type BookPreview } from './memory'

export function openBook(book: BookPreview & { id?: string }) {
  const routeId = bookRouteId(book)
  rememberPreview(routeId, book)
  prefetchBook(routeId)
  router.push(`/book/${routeId}`)
}

/** Call on press-in so loading starts ~100ms before the tap completes. */
export function warmBook(book: { id?: string; open_library_id: string | null }) {
  prefetchBook(bookRouteId(book))
}
