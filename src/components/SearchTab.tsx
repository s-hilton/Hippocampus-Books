import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { searchBooks } from '../lib/openLibrary'
import type { SearchResult } from '../lib/types'
import BookCover from './BookCover'

export default function SearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inPile, setInPile] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('pile_books')
      .select('open_library_key')
      .then(({ data }) => setInPile(new Set((data ?? []).map((row) => row.open_library_key as string))))
  }, [])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      setResults(await searchBooks(q))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function addToPile(book: SearchResult) {
    setAdding(book.openLibraryKey)
    setError(null)
    const { error } = await supabase.from('pile_books').insert({
      open_library_key: book.openLibraryKey,
      title: book.title,
      authors: book.authors,
      cover_id: book.coverId,
      first_publish_year: book.firstPublishYear,
    })
    setAdding(null)
    // 23505 = unique violation: it's already in the pile, which is fine.
    if (error && error.code !== '23505') {
      setError(error.message)
      return
    }
    setInPile((prev) => new Set(prev).add(book.openLibraryKey))
  }

  return (
    <section>
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="search"
          placeholder="Search by title, author, or ISBN"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search books"
        />
        <button type="submit" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="book-list">
        {results.map((book) => {
          const added = inPile.has(book.openLibraryKey)
          return (
            <li key={book.openLibraryKey} className="book-row">
              <BookCover coverId={book.coverId} title={book.title} />
              <div className="book-info">
                <strong>{book.title}</strong>
                <span className="muted">
                  {book.authors.join(', ') || 'Unknown author'}
                  {book.firstPublishYear && ` · ${book.firstPublishYear}`}
                </span>
              </div>
              <button
                onClick={() => addToPile(book)}
                disabled={added || adding === book.openLibraryKey}
              >
                {added ? 'In pile ✓' : adding === book.openLibraryKey ? 'Adding…' : 'Add to pile'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
