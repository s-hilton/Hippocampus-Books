-- Reads and reading progress.
--
-- A "read" is one time through a book: when it started, when it stopped, how it ended
-- (read or dnf) and the page the reader is on. Rereading a book adds another read, so a
-- book read twice has two reads, each with its own dates and progress, and counts twice.
-- reading_progress logs every page update for a read, for its progress chart.
--
-- Progress is in pages, or in percent for a read whose page count isn't known (e.g. an
-- ebook): progress_unit = 'percent' means current_page and reading_progress.page hold a
-- percent (0-100) and page_count is null. Percent entered for a read with a page count
-- is converted to pages by the app.
--
-- user_books.status stays the shelf status the app shows and sets. The trigger below
-- keeps reads in step with it, so every way of changing status (pile, book page, old
-- app versions) records reads the same way:
--   -> reading   no open read: reopen the last read if the book was just marked read or
--                dnf (undoing that), otherwise start a new read.
--   -> read/dnf  close the open read (read: jump to the last page). No open read: correct
--                the last read's outcome, or record a read with no start date.
--   -> want_to_read  drop the open read if no progress was logged, else close it as dnf.
-- Rereading is start_reread(), which starts a new read even when one is finished.
--
-- Reads are kept (like reviews) when a book is removed from the pile.
-- user_books.started_at / finished_at / current_page are superseded by reads and no
-- longer used by the app (drop them in a later migration).

create table public.reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  status text not null default 'reading' check (status in ('reading', 'read', 'dnf')),
  started_at timestamptz default now(),     -- null when marked read without starting it here
  finished_at timestamptz,
  current_page integer check (current_page >= 0),
  page_count integer check (page_count > 0), -- this reader's edition; defaults to the book's
  progress_unit text not null default 'pages' check (progress_unit in ('pages', 'percent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reads_finished_when_done check ((status = 'reading') = (finished_at is null)),
  constraint reads_dates_in_order check (finished_at is null or started_at is null or finished_at >= started_at),
  constraint reads_percent_has_no_page_count check (progress_unit = 'pages' or (page_count is null and current_page <= 100))
);

-- At most one read in progress per user per book.
create unique index reads_one_open_idx on public.reads (user_id, book_id) where status = 'reading';
create index reads_user_book_idx on public.reads (user_id, book_id);
create index reads_book_id_idx on public.reads (book_id);

create trigger reads_set_updated_at
  before update on public.reads
  for each row execute function public.set_updated_at();

alter table public.reads enable row level security;

create policy "Users can view their own reads"
  on public.reads for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own reads"
  on public.reads for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own reads"
  on public.reads for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own reads"
  on public.reads for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table public.reading_progress (
  id bigint generated always as identity primary key,
  read_id uuid not null references public.reads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page integer not null check (page >= 0),
  logged_at timestamptz not null default now()
);

create index reading_progress_read_id_idx on public.reading_progress (read_id, logged_at);
create index reading_progress_user_id_idx on public.reading_progress (user_id);

alter table public.reading_progress enable row level security;

create policy "Users can view their own progress"
  on public.reading_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can log progress on their own reads"
  on public.reading_progress for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.reads r where r.id = read_id and r.user_id = (select auth.uid()))
  );

create policy "Users can delete their own progress"
  on public.reading_progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);

------------------------------------------------------------------------------
-- Keep reads in step with the shelf status
------------------------------------------------------------------------------

create or replace function public.user_books_sync_reads()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_open public.reads;
  v_last public.reads;
  v_end integer; -- the last page (or 100 for a percent read)
begin
  if tg_op = 'UPDATE' and old.status = new.status then
    return null;
  end if;

  select * into v_open from public.reads
  where user_id = new.user_id and book_id = new.book_id and status = 'reading';

  select * into v_last from public.reads
  where user_id = new.user_id and book_id = new.book_id and status <> 'reading'
  order by finished_at desc, created_at desc
  limit 1;

  if new.status = 'reading' then
    if v_open.id is not null then
      null; -- already reading (e.g. start_reread just started one)
    elsif tg_op = 'UPDATE' and old.status in ('read', 'dnf') and v_last.id is not null then
      update public.reads set status = 'reading', finished_at = null where id = v_last.id;
    else
      insert into public.reads (user_id, book_id, page_count)
      select new.user_id, new.book_id, b.page_count from public.books b where b.id = new.book_id;
    end if;

  elsif new.status in ('read', 'dnf') then
    if v_open.id is not null then
      v_end := case when v_open.progress_unit = 'percent' then 100 else v_open.page_count end;
      update public.reads
      set status = new.status::text,
          finished_at = greatest(now(), started_at),
          current_page = case when new.status = 'read' then coalesce(v_end, current_page) else current_page end
      where id = v_open.id;
      -- Finishing reaches the last page: log it so the chart ends at 100%.
      if new.status = 'read' and v_end is not null and v_open.current_page is distinct from v_end then
        insert into public.reading_progress (read_id, user_id, page)
        values (v_open.id, new.user_id, v_end);
      end if;
    elsif v_last.id is not null then
      if v_last.status <> new.status::text then
        update public.reads set status = new.status::text where id = v_last.id;
      end if;
    else
      insert into public.reads (user_id, book_id, status, started_at, finished_at, current_page, page_count)
      select new.user_id, new.book_id, new.status::text, null, now(),
             case when new.status = 'read' then b.page_count end, b.page_count
      from public.books b where b.id = new.book_id;
    end if;

  elsif new.status = 'want_to_read' and v_open.id is not null then
    if exists (select 1 from public.reading_progress where read_id = v_open.id) then
      update public.reads set status = 'dnf', finished_at = greatest(now(), started_at) where id = v_open.id;
    else
      delete from public.reads where id = v_open.id;
    end if;
  end if;

  return null;
end;
$$;

create trigger user_books_sync_reads
  after insert or update of status on public.user_books
  for each row execute function public.user_books_sync_reads();

------------------------------------------------------------------------------
-- start_reread: begin another read of a book on the caller's pile
------------------------------------------------------------------------------

create or replace function public.start_reread(p_book_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_books where user_id = v_uid and book_id = p_book_id) then
    raise exception 'Add this book to your pile first' using errcode = '22023';
  end if;
  if exists (select 1 from public.reads where user_id = v_uid and book_id = p_book_id and status = 'reading') then
    raise exception 'You’re already reading this book' using errcode = '22023';
  end if;

  -- Same edition as last time: its page count, or percent if that's how it was tracked.
  insert into public.reads (user_id, book_id, page_count, progress_unit)
  select v_uid, p_book_id,
         case when last.progress_unit = 'percent' then null else coalesce(last.page_count, b.page_count) end,
         coalesce(last.progress_unit, 'pages')
  from public.books b
  left join lateral (
    select r.page_count, r.progress_unit from public.reads r
    where r.user_id = v_uid and r.book_id = p_book_id
    order by r.created_at desc limit 1
  ) last on true
  where b.id = p_book_id
  returning id into v_id;

  update public.user_books set status = 'reading' where user_id = v_uid and book_id = p_book_id;
  return v_id;
end;
$$;

revoke execute on function public.start_reread(uuid) from public, anon;
grant execute on function public.start_reread(uuid) to authenticated;

------------------------------------------------------------------------------
-- log_progress: set how far a read in progress is and log it
------------------------------------------------------------------------------
-- p_unit: 'pages' (p_page is a page) or 'percent' (p_page is 0-100; only for reads
-- without a page count). Null keeps the read's unit. Switching a percent read to pages
-- needs the page count and converts its logged points.

create or replace function public.log_progress(
  p_read_id uuid,
  p_page integer,
  p_page_count integer default null,
  p_unit text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_read public.reads;
  v_unit text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_page is null or p_page < 0 then
    raise exception 'Enter how far you are' using errcode = '22023';
  end if;
  if p_page_count is not null and p_page_count <= 0 then
    raise exception 'The page count must be more than 0' using errcode = '22023';
  end if;
  if p_unit is not null and p_unit not in ('pages', 'percent') then
    raise exception 'Unknown progress unit' using errcode = '22023';
  end if;

  select * into v_read from public.reads where id = p_read_id and user_id = auth.uid();
  if v_read.id is null then
    raise exception 'Read not found' using errcode = 'P0002';
  end if;
  if v_read.status <> 'reading' then
    raise exception 'This read is finished' using errcode = '22023';
  end if;

  v_unit := coalesce(p_unit, v_read.progress_unit);

  if v_unit = 'percent' then
    if p_page > 100 then
      raise exception 'Enter a percent from 0 to 100' using errcode = '22023';
    end if;
    if v_read.progress_unit = 'pages' then
      if coalesce(p_page_count, v_read.page_count) is not null then
        raise exception 'This read has a page count; enter a page' using errcode = '22023';
      end if;
      if exists (select 1 from public.reading_progress where read_id = p_read_id) then
        raise exception 'Enter the page count to switch this read to percent' using errcode = '22023';
      end if;
    end if;
    update public.reads
    set progress_unit = 'percent', page_count = null, current_page = p_page
    where id = p_read_id;
  else
    v_count := coalesce(p_page_count, case when v_read.progress_unit = 'pages' then v_read.page_count end);
    if v_read.progress_unit = 'percent' then
      if v_count is null then
        raise exception 'Enter the page count to track this read in pages' using errcode = '22023';
      end if;
      update public.reading_progress set page = round(page * v_count / 100.0) where read_id = p_read_id;
    end if;
    if p_page > coalesce(v_count, p_page) then
      raise exception 'That’s past the last page (%)', v_count using errcode = '22023';
    end if;
    update public.reads
    set progress_unit = 'pages', page_count = v_count, current_page = p_page
    where id = p_read_id;
  end if;

  insert into public.reading_progress (read_id, page) values (p_read_id, p_page);
end;
$$;

revoke execute on function public.log_progress(uuid, integer, integer, text) from public, anon;
grant execute on function public.log_progress(uuid, integer, integer, text) to authenticated;

------------------------------------------------------------------------------
-- Existing shelves: one read for each book being read or already read
------------------------------------------------------------------------------

insert into public.reads (user_id, book_id, status, started_at, finished_at, current_page, page_count)
select ub.user_id, ub.book_id, ub.status::text,
       coalesce(ub.started_at::timestamptz, case when ub.status = 'reading' then ub.created_at end),
       case when ub.status = 'read' then greatest(
         coalesce(ub.finished_at::timestamptz, ub.updated_at),
         coalesce(ub.started_at::timestamptz, '-infinity'::timestamptz)) end,
       case when ub.status = 'read' then coalesce(b.page_count, ub.current_page) else ub.current_page end,
       b.page_count
from public.user_books ub
join public.books b on b.id = ub.book_id
where ub.status in ('reading', 'read');
