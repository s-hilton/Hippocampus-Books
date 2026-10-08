-- add_book_to_pile: also accept an existing book's `id`.
-- Without this, adding a manually created book that has no ISBN (e.g. from search
-- results or its details page) created a duplicate instead of reusing the original.
-- Matching order is now: id, open_library_id, isbn_13, isbn_10.

create or replace function public.add_book_to_pile(p_book jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(trim(p_book ->> 'id'), '')::uuid;
  v_ol_id text := nullif(trim(p_book ->> 'open_library_id'), '');
  v_isbn_13 text := nullif(regexp_replace(coalesce(p_book ->> 'isbn_13', ''), '[^0-9]', '', 'g'), '');
  v_isbn_10 text := nullif(upper(regexp_replace(coalesce(p_book ->> 'isbn_10', ''), '[^0-9Xx]', '', 'g')), '');
  v_title text := nullif(trim(p_book ->> 'title'), '');
  v_book_id uuid;
  v_author_id uuid;
  v_author record;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

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
      title, subtitle, page_count, published_date, isbn_10, isbn_13,
      cover_url, open_library_id, source, created_by
    ) values (
      v_title,
      nullif(trim(p_book ->> 'subtitle'), ''),
      nullif(p_book ->> 'page_count', '')::integer,
      nullif(trim(p_book ->> 'published_date'), ''),
      v_isbn_10,
      v_isbn_13,
      nullif(trim(p_book ->> 'cover_url'), ''),
      v_ol_id,
      case when v_ol_id is not null then 'open_library' else 'user' end,
      v_uid
    )
    on conflict do nothing
    returning id into v_book_id;

    if v_book_id is null then
      -- Someone else inserted the same book at the same moment; use theirs.
      select id into v_book_id from public.books
      where open_library_id = v_ol_id or isbn_13 = v_isbn_13 or isbn_10 = v_isbn_10
      limit 1;
    else
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
  end if;

  insert into public.user_books (user_id, book_id)
  values (v_uid, v_book_id)
  on conflict (user_id, book_id) do nothing;

  return v_book_id;
end;
$$;

revoke execute on function public.add_book_to_pile(jsonb) from public, anon;
grant execute on function public.add_book_to_pile(jsonb) to authenticated;
