// Lists the books in a series. Open Library has no series lookup, so this takes the
// series author's works and keeps those whose editions name the same series.
// Results are saved in public.series_lists and reused until stale (see isFresh).
//
// Request:  POST { "name": "Dune Chronicles", "author_key": "/authors/OL79034A" }
// Response: { "name": string, "books": SeriesBook[], "fetched_at": string, "cached": boolean }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalizeSeriesName } from '../_shared/series.ts'
import { buildSeries, isFresh, type CandidateWork, type SeriesBook } from './build.ts'

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

  // Saved lists are written with the service role (users can only read them). Supabase
  // provides these variables to Edge Functions; without them we skip saving.
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const db = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null
  const nameKey = normalizeSeriesName(name)

  if (db) {
    const { data: saved } = await db
      .from('series_lists')
      .select('name, books, fetched_at')
      .eq('name_key', nameKey)
      .eq('author_key', authorKey)
      .maybeSingle()
    if (saved && isFresh(saved.fetched_at, (saved.books as SeriesBook[]).length)) {
      return json({ name: saved.name, books: saved.books, fetched_at: saved.fetched_at, cached: true })
    }
  }

  const params = new URLSearchParams({
    q: `author_key:${authorKey}`,
    limit: String(MAX_WORKS),
    fields: 'key,title,cover_i,first_publish_year,edition_count',
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
    const { error } = await db
      .from('series_lists')
      .upsert(
        { name, name_key: nameKey, author_key: authorKey, books, fetched_at: fetchedAt },
        { onConflict: 'name_key,author_key' },
      )
    if (error) console.error('Could not save series list', error.message) // still return the fresh result
  }

  return json({ name, books, fetched_at: fetchedAt, cached: false })
})
