-- Saved series lists. Building one means ~80 Open Library requests, so the
-- series-books Edge Function stores each result here and reuses it until it goes stale.
--
-- Rows are written only by the Edge Function (with the service role, which bypasses RLS);
-- signed-in users can read them.

create table public.series_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- display name, e.g. "Dune Chronicles"
  name_key text not null,             -- normalized for matching, e.g. "dune" (see _shared/series.ts)
  author_key text not null,           -- Open Library author id, e.g. "OL79034A"
  books jsonb not null default '[]',  -- SeriesBook[]: open_library_id, title, cover_url, first_published, number
  fetched_at timestamptz not null default now(),
  constraint series_lists_name_author_unique unique (name_key, author_key),
  constraint series_lists_books_is_array check (jsonb_typeof(books) = 'array')
);

alter table public.series_lists enable row level security;

create policy "Signed-in users can view series lists"
  on public.series_lists for select
  to authenticated
  using (true);
