// Returns full details for one Open Library work: description, authors, series,
// subjects and editions, normalized into the app's BookDetails shape (see parse.ts).
//
// Results are saved in book_details (the app reads that table directly and only calls
// this function when nothing fresh is saved), and the book is added to / enriched in
// our books catalog.
//
// Request:  POST { "open_library_id": "/works/OL45804W" }   (or just "OL45804W")
// Response: BookDetails

import { catalogBooks, inBackground, serviceClient } from '../_shared/db.ts'
import { buildDetails, type BookDetails, type OLAuthor, type OLEdition, type OLWork } from './parse.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OL = 'https://openlibrary.org'
const headers = { 'User-Agent': 'HippocampusBooks/0.1 (book tracker)' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${OL}${path}`, { headers })
  if (!res.ok) return null
  return (await res.json()) as T
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let id = ''
  try {
    id = String((await req.json()).open_library_id ?? '')
  } catch {
    return json({ error: 'Body must be JSON: { "open_library_id": "/works/OL...W" }' }, 400)
  }
  const workId = id.match(/OL\d+W/)?.[0]
  if (!workId) return json({ error: 'open_library_id must be a work id like /works/OL45804W' }, 400)

  const [work, editionsPage] = await Promise.all([
    getJson<OLWork>(`/works/${workId}.json`),
    getJson<{ size: number; entries: OLEdition[] }>(`/works/${workId}/editions.json?limit=50`),
  ])
  if (!work) return json({ error: 'Book not found on Open Library' }, 404)

  const authorKeys = (work.authors ?? []).flatMap((a) => (a.author?.key ? [a.author.key] : [])).slice(0, 5)
  const authors = (await Promise.all(authorKeys.map((key) => getJson<OLAuthor>(`${key}.json`)))).filter(
    (a): a is OLAuthor => a !== null,
  )

  const editions = editionsPage?.entries ?? []
  const details = buildDetails(work, editions, editionsPage?.size ?? editions.length, authors)
  save(details)
  return json(details)
})

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
      isbn_13: withIsbn?.isbn_13 ?? null,
      isbn_10: withIsbn?.isbn_10 ?? null,
    },
  ])
}
