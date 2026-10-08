-- Reviews: a star rating (required) plus optional written text, one per user per book.
--
-- Ratings move here from user_books.rating: in the app, a "Read" book shows "Leave a
-- review" until one is saved, then shows the review's stars. Existing ratings are copied
-- over as reviews without text. user_books.rating is kept for now but no longer used by
-- the app (it can be dropped in a later migration once no old app versions remain).
--
-- Kept in its own table (not columns on user_books) so reviews survive a status change
-- or removing the book from the pile, and so they can be shown to other readers later.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_user_book_unique unique (user_id, book_id)
);

create index reviews_book_id_idx on public.reviews (book_id);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

-- Private for now: users see only their own reviews.
create policy "Users can view their own reviews"
  on public.reviews for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- You can only review a book you've marked as read.
create policy "Users can review books they have read"
  on public.reviews for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_books ub
      where ub.user_id = (select auth.uid()) and ub.book_id = reviews.book_id and ub.status = 'read'
    )
  );

create policy "Users can update their own reviews"
  on public.reviews for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own reviews"
  on public.reviews for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Carry existing star ratings over as reviews without text.
insert into public.reviews (user_id, book_id, rating)
select user_id, book_id, rating
from public.user_books
where rating is not null
on conflict (user_id, book_id) do nothing;
