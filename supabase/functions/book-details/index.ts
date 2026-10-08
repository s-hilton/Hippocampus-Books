// Returns full details for one Open Library work: description, authors, series,
// subjects and editions, normalized into the app's BookDetails shape (see parse.ts).
//
// Results are saved in book_details (the app reads that table directly and only calls
// this function when nothing fresh is saved), and the book is added to / enriched in
// our books catalog.
//
// Request:  POST { "open_library_id": "/works/OL45804W" }   (or just "OL45804W")
// Response: BookDetails

import { authError, catalogBooks, inBackground, openLibraryHeaders, serviceClient } from '../_shared/db.ts'
import { olGetJson } from '../_shared/openLibrary.ts'
import {
  authorKeys,
  buildDetails,
  str,
  structuredSeriesRef,
  type BookDetails,
  type OLAuthor,
  type OLEdition,
  type OLWork,
  type SeriesInfo,
} from './parse.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (err) {
    // Unexpected data from Open Library must never crash the function: an uncaught error
    // returns a bare 500 without CORS headers, which browsers report as "Failed to send a
    // request". Reply with a readable error instead, and log the details.
    console.error('book-details crashed:', err instanceof Error ? (err.stack ?? err.message) : err)
    return json({ error: 'Something went wrong reading this book from Open Library. Please try again.' }, 500)
  }
})

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const unauthorized = await authError(req)
  if (unauthorized) return json({ error: unauthorized }, 401)

  let id = ''
  try {
    id = String((await req.json()).open_library_id ?? '')
  } catch {
    return json({ error: 'Body must be JSON: { "open_library_id": "/works/OL...W" }' }, 400)
  }
  const workId = id.match(/OL\d+W/)?.[0]
  if (!workId) return json({ error: 'open_library_id must be a work id like /works/OL45804W' }, 400)

  const headers = openLibraryHeaders()
  const [work, editionsPage] = await Promise.all([
    olGetJson<OLWork>(`/works/${workId}.json`, { headers }),
    olGetJson<{ size: number; entries: OLEdition[] }>(`/works/${workId}/editions.json?limit=50`, { headers }),
  ])
  if (!work.ok) {
    console.error(`book-details ${workId}: ${work.message}`)
    return work.notFound
      ? json({ error: 'Book not found on Open Library' }, 404)
      : json({ error: 'Open Library is busy or unavailable. Please try again.' }, 503)
  }

  // Authors and a linked series record (if any) are fetched together.
  const seriesRef = structuredSeriesRef(work.data)
  const [authorResults, seriesRecord] = await Promise.all([
    Promise.all(authorKeys(work.data).map((key) => olGetJson<OLAuthor>(`${key}.json`, { headers }))),
    seriesRef && !seriesRef.name && seriesRef.key
      ? olGetJson<{ name?: unknown; title?: unknown }>(`${seriesRef.key}.json`, { headers })
      : Promise.resolve(null),
  ])
  const authors = authorResults.flatMap((r) => (r.ok && r.data && typeof r.data === 'object' ? [r.data] : []))
  const seriesName =
    seriesRef?.name ?? (seriesRecord?.ok ? (str(seriesRecord.data?.name) ?? str(seriesRecord.data?.title)) : null)
  const structuredSeries: SeriesInfo | null = seriesName ? { name: seriesName, number: seriesRef?.position ?? null } : null

  const page = editionsPage.ok ? editionsPage.data : null
  const editions: OLEdition[] = Array.isArray(page?.entries) ? page.entries : []
  const editionCount = typeof page?.size === 'number' ? page.size : editions.length
  const details = buildDetails(work.data, editions, editionCount, authors, structuredSeries)

  // Only save complete results; a partial one would be reused for 30 days.
  const complete = editionsPage.ok && authorResults.every((r) => r.ok || r.notFound)
  if (complete) save(details)
  else console.error(`book-details ${workId}: partial result not saved`)
  return json(details)
}

function save(details: BookDetails) {
  const db = serviceClient()
  if (db) {
    inBackground('save book details', async () => {
      const { error } = await db
        .from('book_details')
        .upsert({ open_library_id: details.open_library_id, details, fetched_at: new Date().toISOString() })
      if (error) throw error
    })
  }
  const withIsbn = details.editions.find((e) => e.isbn_13 || e.isbn_10)
  catalogBooks([
    {
      open_library_id: details.open_library_id,
      title: details.title,
      subtitle: details.subtitle,
      description: details.description,
      authors: details.authors.map((a) => a.name),
      page_count: details.page_count,
      published_date: details.first_published,
      cover_url: details.cover_url?.replace(/-L\.jpg$/, '-M.jpg') ?? null,
      cover_preferred: true, // newest edition's cover: replaces the catalog's older default
      isbn_13: withIsbn?.isbn_13 ?? null,
      isbn_10: withIsbn?.isbn_10 ?? null,
    },
  ])
}
