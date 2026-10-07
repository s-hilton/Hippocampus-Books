# Hippocampus Books

A book reading tracker (think Goodreads / The StoryGraph). Expo (React Native) app + Supabase backend.

@AGENTS.md

## Stack

- **App:** Expo SDK 57, Expo Router, TypeScript strict. Runs on iOS, Android, and web.
- **Backend:** Supabase: Postgres + Auth (email/password) + Edge Functions.
- **Book data:** Open Library, proxied through the `search-books` Edge Function. Books users pick are cached in our `books` table; users can also add books manually (`source = 'user'`).

## Layout

- `src/app/`: routes only (Expo Router). `(tabs)/index.tsx` = Search, `(tabs)/pile.tsx` = My Pile, `sign-in.tsx`.
- `src/lib/db.ts`: **all** database access goes through here; screens never call `supabase.from()` directly.
- `src/lib/`: supabase client, auth context, types, theme.
- `src/components/`: shared UI.
- `supabase/migrations/`: every schema change, RLS policy, trigger and function.
- `supabase/functions/`: Edge Functions (Deno; excluded from the app's tsconfig).

## Data model

- `books`, `authors`, `book_authors`: shared catalog. Unique on `open_library_id`, `isbn_13`, `isbn_10` to prevent duplicates. Readable by any signed-in user; only `source = 'user'` books are editable, by their creator.
- `user_books`: a user's shelf (`status`: want_to_read | reading | read, `rating` 1–5 only when read, `current_page`, `started_at`, `finished_at`). A trigger fills the dates and clears `rating` when status leaves `read`.
- `profiles`: created by trigger on sign-up.
- Books are added **only** via the `add_book_to_pile(p_book jsonb)` RPC, which finds or creates the book (matching on Open Library id, then ISBN) and adds it to the caller's shelf.

## Rules

- All work happens in pull requests. Backend changes are migrations in `supabase/migrations`, deployed by Supabase's GitHub integration when merged to `main` (the production branch). Never change the schema through the dashboard; never run `supabase db push` directly.
- Never edit a migration that has been merged to `main`; add a new one.
- Every table has RLS enabled with explicit policies.
- After any migration, regenerate types with `supabase gen types` if a database is reachable. (Cloud sessions usually can't run one; the app currently uses hand-written types in `src/lib/types.ts`.)
- Build one feature at a time, end to end: migration → RLS → `src/lib/db.ts` → screen.
- Before finishing: `npx tsc --noEmit` and `npx expo lint` must pass. In cloud sessions use `EXPO_OFFLINE=1` with `npx expo install` / `npx expo lint` (expo's API may be blocked).
- **At the end of every task and in every PR description, list any manual steps needed in the Supabase dashboard (auth settings, secrets, redirect URLs), or say explicitly that none are needed.**
