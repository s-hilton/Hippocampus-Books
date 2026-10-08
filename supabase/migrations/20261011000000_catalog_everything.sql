-- Catalogue everything we learn from Open Library so the app gets faster over time.
--
-- * book_details: saved book-details results (description, authors, series, editions).
-- * search_cache: saved search-books results per normalized query.
-- * catalog_book(): one shared find-or-create for the books catalog, used by
--   add_book_to_pile (for users) and catalog_books (for Edge Functions, which add every
--   book they see in searches, book pages and series lists).
--
-- The cache tables are written only by Edge Functions with the service role (which
-- bypasses RLS); signed-in users can read them directly, which is faster than calling
-- a function.

------------------------------------------------------------------------------
-- Cache tables
------------------------------------------------------------------------------

create table public.book_details (
  open_library_id text primary key,   -- work key, e.g. "/works/OL45804W"
  details jsonb not null,             -- BookDetails (see supabase/functions/book-details/parse.ts)
  fetched_at timestamptz not null default now(),
  constraint book_details_is_object check (jsonb_typeof(details) = 'object')
);

create table public.search_cache (
  query_key text primary key,         -- normalized query (see _shared/cache.ts)
  results jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  constraint search_cache_results_is_array check (jsonb_typeof(results) = 'array')
);

alter table public.book_details enable row level security;
alter table public.search_cache enable row level security;

create policy "Signed-in users can view saved book details"
  on public.book_details for select
  to authenticated
  using (true);

create policy "Signed-in users can view saved searches"
  on public.search_cache for select
  to authenticated
  using (true);

------------------------------------------------------------------------------
-- catalog_book: find or create one book (internal; not callable by users)
------------------------------------------------------------------------------
-- p_book keys: id, open_library_id, title, subtitle, description, authors (text[]),
-- page_count, published_date, isbn_10, isbn_13, cover_url.
-- Matches on id, then open_library_id, then isbn_13, then isbn_10.
-- With p_enrich, an existing book's empty fields are filled in from p_book (never
-- overwritten). Only trusted callers (Edge Functions) enrich; user input never does.

create or replace function public.catalog_book(p_book jsonb, p_created_by uuid, p_enrich boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(trim(p_book ->> 'id'), '')::uuid;
  v_ol_id text := nullif(trim(p_book ->> 'open_library_id'), '');
  v_isbn_13 text := nullif(regexp_replace(coalesce(p_book ->> 'isbn_13', ''), '[^0-9]', '', 'g'), '');
  v_isbn_10 text := nullif(upper(regexp_replace(coalesce(p_book ->> 'isbn_10', ''), '[^0-9Xx]', '', 'g')), '');
  v_title text := nullif(trim(p_book ->> 'title'), '');
  v_subtitle text := nullif(trim(p_book ->> 'subtitle'), '');
  v_description text := nullif(trim(p_book ->> 'description'), '');
  v_page_count integer := nullif(p_book ->> 'page_count', '')::integer;
  v_published text := nullif(trim(p_book ->> 'published_date'), '');
  v_cover text := nullif(trim(p_book ->> 'cover_url'), '');
  v_book_id uuid;
  v_created boolean := false;
  v_author_id uuid;
  v_author record;
begin
  -- Ignore malformed ISBNs rather than failing the whole book.
  if v_isbn_13 !~ '^[0-9]{13}$' then v_isbn_13 := null; end if;
  if v_isbn_10 !~ '^[0-9]{9}[0-9X]$' then v_isbn_10 := null; end if;
  if v_page_count <= 0 then v_page_count := null; end if;

  if v_id is not null then
    select id into v_book_id from public.books where id = v_id;
  end if;
  if v_book_id is null and v_ol_id is not null then
    select id into v_book_id from public.books where open_library_id = v_ol_id;
  end if;
  if v_book_id is null and v_isbn_13 is not null then
    select id into v_book_id from public.books where isbn_13 = v_isbn_13;
  end if;
  if v_book_id is null and v_isbn_10 is not null then
    select id into v_book_id from public.books where isbn_10 = v_isbn_10;
  end if;

  if v_book_id is null then
    if v_title is null then
      raise exception 'A title is required' using errcode = '22023';
    end if;

    insert into public.books (
      title, subtitle, description, page_count, published_date, isbn_10, isbn_13,
      cover_url, open_library_id, source, created_by
    ) values (
      v_title, v_subtitle, v_description, v_page_count, v_published, v_isbn_10, v_isbn_13,
      v_cover, v_ol_id,
      case when v_ol_id is not null then 'open_library' else 'user' end,
      p_created_by
    )
    on conflict do nothing
    returning id into v_book_id;

    if v_book_id is null then
      -- Someone else inserted the same book at the same moment; use theirs.
      select id into v_book_id from public.books
      where open_library_id = v_ol_id or isbn_13 = v_isbn_13 or isbn_10 = v_isbn_10
      limit 1;
    else
      v_created := true;
    end if;
  elsif p_enrich then
    update public.books b set
      subtitle = coalesce(b.subtitle, v_subtitle),
      description = coalesce(b.description, v_description),
      page_count = coalesce(b.page_count, v_page_count),
      published_date = coalesce(b.published_date, v_published),
      cover_url = coalesce(b.cover_url, v_cover),
      open_library_id = coalesce(b.open_library_id,
        (select v_ol_id where not exists (select 1 from public.books x where x.open_library_id = v_ol_id))),
      isbn_13 = coalesce(b.isbn_13,
        (select v_isbn_13 where not exists (select 1 from public.books x where x.isbn_13 = v_isbn_13))),
      isbn_10 = coalesce(b.isbn_10,
        (select v_isbn_10 where not exists (select 1 from public.books x where x.isbn_10 = v_isbn_10)))
    where b.id = v_book_id;
  end if;

  -- Authors: for new books, and for enriched books that have none yet.
  if v_book_id is not null
     and (v_created or (p_enrich and not exists (select 1 from public.book_authors where book_id = v_book_id))) then
    for v_author in
      select trim(name) as name, (ord - 1)::smallint as position
      from jsonb_array_elements_text(coalesce(p_book -> 'authors', '[]'::jsonb)) with ordinality as a(name, ord)
      where trim(name) <> ''
    loop
      insert into public.authors (name) values (v_author.name)
      on conflict (name) do nothing;
      select id into v_author_id from public.authors where name = v_author.name;
      insert into public.book_authors (book_id, author_id, position)
      values (v_book_id, v_author_id, v_author.position)
      on conflict do nothing;
    end loop;
  end if;

  return v_book_id;
end;
$$;

revoke execute on function public.catalog_book(jsonb, uuid, boolean) from public, anon, authenticated;

------------------------------------------------------------------------------
-- catalog_books: bulk find-or-create + enrich, for Edge Functions only
------------------------------------------------------------------------------

create or replace function public.catalog_books(p_books jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_books) <> 'array' then
    return 0;
  end if;
  for v_book in select value from jsonb_array_elements(p_books) loop
    begin
      perform public.catalog_book(v_book, null, true);
      v_count := v_count + 1;
    exception when others then
      -- One bad record (e.g. no title) shouldn't stop the rest.
      raise warning 'catalog_books skipped a book: %', sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.catalog_books(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_books(jsonb) to service_role;

------------------------------------------------------------------------------
-- add_book_to_pile: same behavior as before, now built on catalog_book
------------------------------------------------------------------------------

create or replace function public.add_book_to_pile(p_book jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_book_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  v_book_id := public.catalog_book(p_book, v_uid, false);

  insert into public.user_books (user_id, book_id)
  values (v_uid, v_book_id)
  on conflict (user_id, book_id) do nothing;

  return v_book_id;
end;
$$;

revoke execute on function public.add_book_to_pile(jsonb) from public, anon;
grant execute on function public.add_book_to_pile(jsonb) to authenticated;
