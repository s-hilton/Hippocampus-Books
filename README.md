# Hippocampus Books

A simple book tracker. Search for books, add them to your pile, and track whether you want to read, are reading, or have read each one. Finished books can get a 1–5 star rating.

**Stack:** React + TypeScript (Vite), Supabase (auth + Postgres), and the [Open Library](https://openlibrary.org/developers/api) search API (free, no key needed).

## Tabs

- **Search**: search Open Library by title, author, or ISBN and add results to your pile.
- **My Pile**: set each book to *Want to read*, *Reading*, or *Read*. *Read* books show a star rating. Click the current star again to clear it.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

## Supabase

- Schema lives in `supabase/migrations/`. The `pile_books` table has row-level security, so each user only sees their own pile.
- Sign-in uses email magic links. In the Supabase dashboard → **Authentication → URL Configuration**, add your local (`http://localhost:5173`) and deployed URLs to the redirect allow-list.
- **GitHub integration:** set **Supabase directory** to `supabase` and **Production branch** to `main`. Migrations merged into `main` deploy to the production project.
