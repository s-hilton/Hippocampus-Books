// Lists the books in a series. Open Library has no series lookup, so this takes the
// series author's works and keeps those whose editions name the same series.
// Results are saved in public.series_lists and reused until stale (see isFresh).
//
// Request:  POST { "name": "Dune Chronicles", "author_key": "/authors/OL79034A" }
// Response: { "name": string, "books": SeriesBook[], "fetched_at": string, "cached": boolean }

import { isFresh, TTL_DAYS } from '../_shared/cache.ts'
import { catalogBooks, inBackground, serviceClient } from '../_shared/db.ts'
import { normalizeSeriesName } from '../_shared/series.ts'
import { buildSeries, type CandidateWork, type SeriesBook } from './build.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OL = 'https://openlibrary.org'
const headers = { 'User-Agent': 'HippocampusBooks/0.1 (book tracker)' }
const MAX_WORKS = 40 // how many of the author's works to check
const CONCURRENCY = 6 // be polite to Open Library

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${OL}${path}`, { headers })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

interface SearchDoc {
  key: string
  title: string
  author_name?: string[]
  cover_i?: number
  first_publish_year?: number
  edition_count?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let name = ''
  let authorKey = ''
  try {
    const body = await req.json()
    name = String(body.name ?? '').trim()
    authorKey = String(body.author_key ?? '').match(/OL\d+A/)?.[0] ?? ''
  } catch {
    return json({ error: 'Body must be JSON: { "name": "...", "author_key": "/authors/OL...A" }' }, 400)
  }
  if (!name || !authorKey) return json({ error: 'name and author_key are required' }, 400)

  // Saved lists are written with the service role (users can only read them).
  const db = serviceClient()
  const nameKey = normalizeSeriesName(name)

  if (db) {
    const { data: saved } = await db
      .from('series_lists')
      .select('name, books, fetched_at')
      .eq('name_key', nameKey)
      .eq('author_key', authorKey)
      .maybeSingle()
    const count = saved ? (saved.books as SeriesBook[]).length : 0
    if (saved && isFresh(saved.fetched_at, count > 0 ? TTL_DAYS.series : TTL_DAYS.empty)) {
      return json({ name: saved.name, books: saved.books, fetched_at: saved.fetched_at, cached: true })
    }
  }

  const params = new URLSearchParams({
    q: `author_key:${authorKey}`,
    limit: String(MAX_WORKS),
    fields: 'key,title,cover_i,first_publish_year,edition_count,author_name',
  })
  const search = await getJson<{ docs: SearchDoc[] }>(`/search.json?${params}`)
  if (!search) return json({ error: 'Open Library search failed' }, 502)

  const candidates: CandidateWork[] = await mapLimit(search.docs, CONCURRENCY, async (doc) => {
    const [work, editions] = await Promise.all([
      getJson<{ series?: string[] }>(`${doc.key}.json`),
      getJson<{ entries: { series?: string[] }[] }>(`${doc.key}/editions.json?limit=50`),
    ])
    return {
      ...doc,
      series: [...(work?.series ?? []), ...(editions?.entries ?? []).flatMap((e) => e.series ?? [])],
    }
  })

  const books = buildSeries(name, candidates)
  const fetchedAt = new Date().toISOString()
  if (db) {
    inBackground('save series list', async () => {
      const { error } = await db
        .from('series_lists')
        .upsert(
          { name, name_key: nameKey, author_key: authorKey, books, fetched_at: fetchedAt },
          { onConflict: 'name_key,author_key' },
        )
      if (error) throw error
    })
  }
  catalogBooks(
    candidates
      .filter((c) => books.some((b) => b.open_library_id === c.key))
      .map((c) => ({
        open_library_id: c.key,
        title: c.title,
        published_date: c.first_publish_year ? String(c.first_publish_year) : null,
        cover_url: c.cover_i && c.cover_i > 0 ? `https://covers.openlibrary.org/b/id/${c.cover_i}-M.jpg` : null,
        authors: c.author_name ?? [],
      })),
  )

  return json({ name, books, fetched_at: fetchedAt, cached: false })
})
