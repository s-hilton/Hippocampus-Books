-- Let book-details replace a catalog book's cover with the newest edition's cover.
--
-- catalog_book normally only fills empty fields. When p_book has "cover_preferred": true
-- (sent only by the book-details Edge Function, via the service-role-only catalog_books),
-- its cover replaces the existing one, except on books users added manually.

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
  v_cover_preferred boolean := coalesce((p_book ->> 'cover_preferred')::boolean, false);
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
      cover_url = case
        when v_cover_preferred and v_cover is not null and b.source <> 'user' then v_cover
        else coalesce(b.cover_url, v_cover)
      end,
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
