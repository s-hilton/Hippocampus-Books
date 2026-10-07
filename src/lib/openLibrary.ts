import type { SearchResult } from './types'

interface OpenLibraryDoc {
  key: string
  title: string
  author_name?: string[]
  cover_i?: number
  first_publish_year?: number
}

export async function searchBooks(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '20',
    fields: 'key,title,author_name,cover_i,first_publish_year',
  })
  const res = await fetch(`https://openlibrary.org/search.json?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { docs: OpenLibraryDoc[] }
  return data.docs.map((doc) => ({
    openLibraryKey: doc.key,
    title: doc.title,
    authors: doc.author_name ?? [],
    coverId: doc.cover_i ?? null,
    firstPublishYear: doc.first_publish_year ?? null,
  }))
}

export function coverUrl(coverId: number | null, size: 'S' | 'M' | 'L' = 'M'): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null
}
