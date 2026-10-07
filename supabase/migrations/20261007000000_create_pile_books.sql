-- A user's "pile": books they've added from search, with reading status and an optional star rating.

create type public.reading_status as enum ('want_to_read', 'reading', 'read');

create table public.pile_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  open_library_key text not null,           -- e.g. "/works/OL45804W"
  title text not null,
  authors text[] not null default '{}',
  cover_id integer,                         -- Open Library cover id, if any
  first_publish_year integer,
  status public.reading_status not null default 'want_to_read',
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pile_books_rating_only_when_read check (rating is null or status = 'read'),
  constraint pile_books_user_book_unique unique (user_id, open_library_key)
);

create index pile_books_user_id_idx on public.pile_books (user_id);

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

create trigger pile_books_set_updated_at
  before update on public.pile_books
  for each row execute function public.set_updated_at();

alter table public.pile_books enable row level security;

create policy "Users can view their own pile"
  on public.pile_books for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add to their own pile"
  on public.pile_books for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own pile"
  on public.pile_books for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can remove from their own pile"
  on public.pile_books for delete
  to authenticated
  using ((select auth.uid()) = user_id);
