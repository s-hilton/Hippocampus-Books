-- Core data model: a shared book catalog (cached from Open Library or added by users)
-- and each user's personal shelf entries.
--
-- Replaces the earlier single-table `pile_books` prototype.

drop table if exists public.pile_books;
drop type if exists public.reading_status;

create extension if not exists pg_trgm with schema extensions;

-- Shared helper: keep updated_at current.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- profiles: one row per user, created automatically on sign-up
------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- books / authors: the shared catalog
------------------------------------------------------------------------------

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  description text,
  page_count integer check (page_count > 0),
  published_date text,                      -- free-form: "1965", "1965-08", etc.
  isbn_10 text unique check (isbn_10 ~ '^[0-9]{9}[0-9X]$'),
  isbn_13 text unique check (isbn_13 ~ '^[0-9]{13}$'),
  cover_url text,
  open_library_id text unique,              -- work key, e.g. "/works/OL45804W"
  google_books_id text unique,
  source text not null check (source in ('open_library', 'google_books', 'user')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index books_title_trgm_idx on public.books using gin (title extensions.gin_trgm_ops);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0)
);

create table public.book_authors (
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete cascade,
  position smallint not null default 0,
  primary key (book_id, author_id)
);

create index book_authors_author_id_idx on public.book_authors (author_id);

alter table public.books enable row level security;
alter table public.authors enable row level security;
alter table public.book_authors enable row level security;

create policy "Signed-in users can view books"
  on public.books for select
  to authenticated
  using (true);

create policy "Users can edit books they created"
  on public.books for update
  to authenticated
  using ((select auth.uid()) = created_by and source = 'user')
  with check ((select auth.uid()) = created_by and source = 'user');

create policy "Signed-in users can view authors"
  on public.authors for select
  to authenticated
  using (true);

create policy "Signed-in users can view book authors"
  on public.book_authors for select
  to authenticated
  using (true);

-- Inserts into books/authors/book_authors go through add_book_to_pile() below,
-- which de-duplicates, so there are deliberately no insert policies here.

------------------------------------------------------------------------------
-- user_books: a user's shelf
------------------------------------------------------------------------------

create type public.reading_status as enum ('want_to_read', 'reading', 'read');

create table public.user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  status public.reading_status not null default 'want_to_read',
  rating smallint check (rating between 1 and 5),
  current_page integer check (current_page >= 0),
  started_at date,
  finished_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_books_user_book_unique unique (user_id, book_id),
  constraint user_books_rating_only_when_read check (rating is null or status = 'read')
);

create index user_books_book_id_idx on public.user_books (book_id);

-- Keep dates and rating consistent with status changes so the app doesn't have to.
create or replace function public.user_books_on_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'reading' and new.started_at is null then
    new.started_at = current_date;
  elsif new.status = 'read' and new.finished_at is null then
    new.finished_at = current_date;
  end if;
  if new.status <> 'read' then
    new.rating = null;
  end if;
  return new;
end;
$$;

create trigger user_books_status_change
  before insert or update of status on public.user_books
  for each row execute function public.user_books_on_status_change();

create trigger user_books_set_updated_at
  before update on public.user_books
  for each row execute function public.set_updated_at();

alter table public.user_books enable row level security;

create policy "Users can view their own shelf"
  on public.user_books for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add to their own shelf"
  on public.user_books for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own shelf"
  on public.user_books for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can remove from their own shelf"
  on public.user_books for delete
  to authenticated
  using ((select auth.uid()) = user_id);

------------------------------------------------------------------------------
-- add_book_to_pile: find-or-create a book, then put it on the caller's shelf
------------------------------------------------------------------------------
-- p_book keys: open_library_id, title, subtitle, authors (text[]), page_count,
-- published_date, isbn_10, isbn_13, cover_url.
-- Matches an existing book by open_library_id, then isbn_13, then isbn_10, so the
-- same book is never stored twice. Returns the book's id.

create or replace function public.add_book_to_pile(p_book jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
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

  if v_ol_id is not null then
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
