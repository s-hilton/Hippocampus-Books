// Pure logic for series-books: decide which of an author's works belong to a series
// and in what order. Free of Deno APIs so it can be unit-tested with Node.

import { positionInSeries } from '../_shared/series.ts'

export interface CandidateWork {
  key: string // "/works/OL45804W"
  title: string
  cover_i?: number
  first_publish_year?: number
  edition_count?: number
  series: string[] // series strings from the work and its editions
}

export interface SeriesBook {
  open_library_id: string
  title: string
  cover_url: string | null
  first_published: string | null
  number: string | null
}

export function buildSeries(target: string, works: CandidateWork[]): SeriesBook[] {
  const matched = works.flatMap((w) => {
    const number = positionInSeries(w.series, target)
    return number === undefined ? [] : [{ work: w, number }]
  })

  // Open Library often has duplicate works for one book; keep the most-published per position.
  const byNumber = new Map<string, (typeof matched)[number]>()
  const unnumbered: typeof matched = []
  for (const m of matched) {
    if (m.number === null) {
      unnumbered.push(m)
      continue
    }
    const current = byNumber.get(m.number)
    if (!current || (m.work.edition_count ?? 0) > (current.work.edition_count ?? 0)) byNumber.set(m.number, m)
  }

  const numbered = [...byNumber.values()].sort((a, b) => Number(a.number) - Number(b.number))
  const rest = unnumbered.sort((a, b) => (a.work.first_publish_year ?? 9999) - (b.work.first_publish_year ?? 9999))

  return [...numbered, ...rest].map(({ work, number }) => ({
    open_library_id: work.key,
    title: work.title,
    cover_url: work.cover_i && work.cover_i > 0 ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg` : null,
    first_published: work.first_publish_year ? String(work.first_publish_year) : null,
    number,
  }))
}
