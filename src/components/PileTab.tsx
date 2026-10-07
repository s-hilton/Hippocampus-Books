import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS_LABELS, type PileBook, type ReadingStatus } from '../lib/types'
import BookCover from './BookCover'
import StarRating from './StarRating'

export default function PileTab() {
  const [books, setBooks] = useState<PileBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('pile_books')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setBooks(data as PileBook[])
        setLoading(false)
      })
  }, [])

  async function updateBook(id: string, changes: Partial<Pick<PileBook, 'status' | 'rating'>>) {
    const previous = books
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...changes } : b)))
    const { error } = await supabase.from('pile_books').update(changes).eq('id', id)
    if (error) {
      setBooks(previous)
      setError(error.message)
    }
  }

  function setStatus(book: PileBook, status: ReadingStatus) {
    // Ratings only make sense for finished books, so clear it when moving away from "read".
    updateBook(book.id, status === 'read' ? { status } : { status, rating: null })
  }

  async function removeBook(id: string) {
    const previous = books
    setBooks((prev) => prev.filter((b) => b.id !== id))
    const { error } = await supabase.from('pile_books').delete().eq('id', id)
    if (error) {
      setBooks(previous)
      setError(error.message)
    }
  }

  if (loading) return <p>Loading your pile…</p>

  return (
    <section>
      {error && <p className="error">{error}</p>}
      {books.length === 0 ? (
        <p className="muted">Your pile is empty. Search for a book to add one.</p>
      ) : (
        <ul className="book-list">
          {books.map((book) => (
            <li key={book.id} className="book-row">
              <BookCover coverId={book.cover_id} title={book.title} />
              <div className="book-info">
                <strong>{book.title}</strong>
                <span className="muted">{book.authors.join(', ') || 'Unknown author'}</span>
                <div className="status-picker" role="group" aria-label="Reading status">
                  {(Object.keys(STATUS_LABELS) as ReadingStatus[]).map((status) => (
                    <button
                      key={status}
                      className={book.status === status ? 'chip active' : 'chip'}
                      aria-pressed={book.status === status}
                      onClick={() => setStatus(book, status)}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
                {book.status === 'read' && (
                  <StarRating value={book.rating} onChange={(rating) => updateBook(book.id, { rating })} />
                )}
              </div>
              <button className="link danger" onClick={() => removeBook(book.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
