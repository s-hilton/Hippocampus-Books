// Proxies book searches to Open Library and returns results in the app's own shape.
// Keeping this server-side means we can add Google Books later (which needs an API key)
// without shipping the key in the app, and without changing the app's code.
//
// Request:  POST { "query": "dune" }
// Response: { "results": CatalogBook[] }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CatalogBook {
  open_library_id: string
  title: string
  subtitle: string | null
  authors: string[]
  cover_url: string | null
  published_date: string | null
  page_count: number | null
  isbn_13: string | null
  isbn_10: string | null
}

interface OpenLibraryDoc {
  key: string
  title: string
  subtitle?: string
  author_name?: string[]
  cover_i?: number
  first_publish_year?: number
  number_of_pages_median?: number
  isbn?: string[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalize(doc: OpenLibraryDoc): CatalogBook {
  const isbns = doc.isbn ?? []
  return {
    open_library_id: doc.key,
    title: doc.title,
    subtitle: doc.subtitle ?? null,
    authors: doc.author_name ?? [],
    cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    published_date: doc.first_publish_year ? String(doc.first_publish_year) : null,
    page_count: doc.number_of_pages_median ?? null,
    isbn_13: isbns.find((i) => /^\d{13}$/.test(i)) ?? null,
    isbn_10: isbns.find((i) => /^\d{9}[\dX]$/.test(i)) ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let query = ''
  try {
    query = String((await req.json()).query ?? '').trim()
  } catch {
    return json({ error: 'Body must be JSON: { "query": "..." }' }, 400)
  }
  if (query.length < 2) return json({ results: [] })

  const params = new URLSearchParams({
    q: query,
    limit: '20',
    fields: 'key,title,subtitle,author_name,cover_i,first_publish_year,number_of_pages_median,isbn',
  })
  const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
    headers: { 'User-Agent': 'HippocampusBooks/0.1 (book tracker)' },
  })
  if (!res.ok) return json({ error: `Open Library search failed (${res.status})` }, 502)

  const data = (await res.json()) as { docs: OpenLibraryDoc[] }
  return json({ results: data.docs.map(normalize) })
})
