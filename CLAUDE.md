# Hippocampus Books

A book reading tracker (think Goodreads / The StoryGraph). Expo (React Native) app + Supabase backend.

@AGENTS.md

## Stack

- **App:** Expo SDK 57, Expo Router, TypeScript strict. Runs on iOS, Android, and web.
- **Backend:** Supabase: Postgres + Auth (email/password) + Edge Functions.
- **Config:** `.env` holds the public Supabase URL + publishable key and is committed. Never add secret keys (`service_role` / `sb_secret_...`) to the app or the repo.
- **Book data:** Open Library, proxied through Edge Functions. Everything they fetch is catalogued: every book seen in a search, book page or series list goes into `books` (via `catalog_books`), and results are saved in `search_cache`, `book_details` and `series_lists`. Users can also add books manually (`source = 'user'`). Open Library rate-limits by IP and Supabase's functions share IPs, so keep request counts and concurrency low, and only save complete results. Optional secret `OPEN_LIBRARY_CONTACT` (an email/URL) is sent in the User-Agent, which Open Library rewards with a higher rate limit.

## Layout

- `src/app/`: routes only (Expo Router). `sign-in.tsx` is public; everything under `(app)/` requires sign-in (checked in `(app)/_layout.tsx`): `(app)/(tabs)/index.tsx` = Search, `(app)/(tabs)/pile.tsx` = My Pile, `(app)/book/[id].tsx` = book details (`id` is an Open Library work id like `OL45804W`, or our `books.id` for books without one; build it with `bookRouteId()`), `(app)/series.tsx?name=…&author=/authors/OL…A` = books in a series.
- `src/lib/db.ts`: **all** database access goes through here; screens never call `supabase.from()` directly.
- `src/lib/`: supabase client, auth context, types, theme. `memory.ts` = in-memory caches (`memoAsync`, list-row previews); `navigation.ts` = `openBook()` / `warmBook()`, which every list uses to open a book (remembers the row so the page draws instantly, and starts loading on press-in).
- `src/components/`: shared UI.
- `supabase/migrations/`: every schema change, RLS policy, trigger and function.
- `supabase/functions/`: Edge Functions (Deno; excluded from the app's tsconfig). `search-books` = search; `book-details` = description, authors, series, subjects and editions for one work; `series-books` = books in a series (checks up to 40 of the author's works for matching edition series strings; results saved in `series_lists`). Shared code goes in `_shared/`: `series.ts` (series parsing/matching) and `cache.ts` (freshness rules, query keys) have no imports, so the app imports them too; `openLibrary.ts` (`olGetJson`: every Open Library request goes through it, with retries on 429/5xx, a timeout, and "not found" vs "busy" results; `mapLimit`) uses only `fetch`, so Node can test it; `db.ts` (service-role client, `inBackground`, `catalogBooks`, `openLibraryHeaders`) is Deno-only. Keep logic in Deno-free modules (`book-details/parse.ts`, `series-books/build.ts`) so it can be tested with `node --experimental-strip-types`.

## Data model

- `books`, `authors`, `book_authors`: shared catalog. Unique on `open_library_id`, `isbn_13`, `isbn_10` to prevent duplicates. Readable by any signed-in user; only `source = 'user'` books are editable, by their creator.
- `user_books`: a user's shelf (`status`: want_to_read | reading | read, `current_page`, `started_at`, `finished_at`). A trigger fills the dates. Its `rating` column is **deprecated** (copied into `reviews`; no longer read or written by the app; drop it in a later migration).
- `reviews`: one per user per book: `rating` 1–5 (required) and optional `body` text. Private (users see only their own) for now; can only be created for books marked read, but survives status changes. In the app, a Read book shows "Leave a review" until one exists, then its stars (`ReviewForm` component). `saveReview()` updates an existing review or inserts a new one (don't upsert: the insert policy requires status = read).
- `profiles`: created by trigger on sign-up.
- Saved Open Library data, written only by Edge Functions with the service role (signed-in users can read; the app reads these tables directly and only calls a function when nothing fresh is saved). Freshness rules live in `_shared/cache.ts` (`TTL_DAYS`):
  - `search_cache`: search results per normalized query (7 days).
  - `book_details`: book-details results per work (30 days).
  - `series_lists`: series-books results per (`name_key`, `author_key`) (30 days). Empty results: 1 day.
- `catalog_book(p_book, p_created_by, p_enrich)` is the one find-or-create for `books` (internal). `catalog_books(jsonb)` (service role only) adds/enriches many at once; enrichment only fills empty fields, never overwrites, and user input never enriches — except `cover_preferred: true` (sent only by book-details) replaces the cover with the newest edition's, on non-user books.
- Users add books **only** via the `add_book_to_pile(p_book jsonb)` RPC, which uses `catalog_book` (matching on `id`, then Open Library id, then ISBN) and adds it to the caller's shelf.
- `tags`: the fixed trope (1,204) and content warning (264) lists, `kind` + `slug` unique. Source of truth: `supabase/data/tropes.csv` and `content_warnings.csv`; `supabase/data/generate_tags_sql.py` turns them into upsert SQL for a NEW migration. More than 1,000 rows, so the app pages through them (`getAllTags`, Supabase caps responses at 1,000 rows).
- Reader-added tags: in the review form, typed text can be added as a tag. `ensure_tag(kind, name)` matches an existing tag by slug or case-insensitive name, else creates one in category "Added by readers" (with `created_by`; 2–40 chars; max 10 new of each kind per review). `tag_slug()` (SQL) and `slugifyTag()` (`src/lib/tags.ts`) must produce identical slugs; both reproduce every slug in the CSVs.
- `review_tags`: which tags a review picked (only the review's author can see/change them). Save reviews with the `save_review(...)` RPC (rating, text, existing tag slugs and typed new tag names in one step). `book_tag_counts(book_id)` (security definer) returns how many readers picked each tag: totals only, never who. Shown on the book page as "Hippocampus Community Tropes" / "Hippocampus Community Content Warnings".
- Series info is best-effort, parsed from Open Library edition data; series lists only find books by the series' first author.

## Rules

- All work happens in pull requests. Backend changes are migrations in `supabase/migrations`, deployed by Supabase's GitHub integration when merged to `main` (the production branch). Never change the schema through the dashboard; never run `supabase db push` directly.
- Never edit a migration that has been merged to `main`; add a new one.
- Every table has RLS enabled with explicit policies.
- Book cover = the newest edition's cover (same main language, not audio), falling back to Open Library's default (`pickCover` in `book-details/parse.ts`).
- Function auth: `verify_jwt = false` in `config.toml` on purpose. Each function calls `authError(req)` (`_shared/db.ts`), which verifies the user's token with `getClaims()`; the gateway's legacy `verify_jwt` check rejects tokens signed with the new asymmetric signing keys.
- Open Library data is untrusted: fields can be strings, lists, objects, numbers or missing. Parse via the `str`/`items`/`seriesEntries` helpers in `book-details/parse.ts` and never assume a shape. Every function wraps its handler in try/catch: an uncaught error returns a bare 500 without CORS headers, which browsers report as "Failed to send a request to the Edge Function".
- Series: a work's structured series record (`{ series: { key: "/series/OL…L" }, position }`) wins over guesses from edition text; book-details looks up its name.
- Errors: Edge Functions return `{ error: "readable reason" }` (503 when Open Library is busy, 404 when not found); `functionError()` in `db.ts` surfaces it. Screens offer "Try again" rather than a dead end.
- Search runs as you type (catalog after a 250ms pause, Open Library after 700ms and 3+ characters; the Search button skips the wait). Opening a book page preloads its series list (`prefetchSeries`).
- Speed: screens show what's already known first (catalog rows, memory, saved data) and fill in from Open Library after; never block a whole screen on an Edge Function. Edge Functions save in the background (`inBackground`) after responding.
- Accessibility: use `role` / `aria-*` props (they work on native and web), not `accessibilityRole` / `accessibilityState`.
- After any migration, regenerate types with `supabase gen types` if a database is reachable. (Cloud sessions usually can't run one; the app currently uses hand-written types in `src/lib/types.ts`.)
- Build one feature at a time, end to end: migration → RLS → `src/lib/db.ts` → screen.
- Before finishing: `npx tsc --noEmit` and `npx expo lint` must pass. In cloud sessions use `EXPO_OFFLINE=1` with `npx expo install` / `npx expo lint` (expo's API may be blocked).
- **At the end of every task and in every PR description, list any manual steps needed in the Supabase dashboard (auth settings, secrets, redirect URLs), or say explicitly that none are needed.**
