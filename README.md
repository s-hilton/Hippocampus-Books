# Hippocampus Books

A book reading tracker. Search for books (or add them by hand), put them on your pile, and mark each one *Want to read*, *Reading* or *Read*. Finished books get a 1–5 star rating.

Expo (React Native) + Supabase. See [`CLAUDE.md`](CLAUDE.md) for the architecture and conventions.

## Screens

- **Search:** searches your own catalog and Open Library. Tap **Add** to put a book on your pile. If a book can't be found, **Add a book manually**.
- **My Pile:** filter by status; tap a status to change it. *Read* books show stars (tap the current star again to clear it).
- **Book page:** tap any book in Search or My Pile to see its description, series and number, authors, subjects and editions, and to add it or change its status.

## Supabase setup (one time)

1. **GitHub integration:** Project Settings → Integrations → GitHub. Connect this repo, set **Supabase directory** to `supabase`, **Production branch** to `main`, and turn on **Deploy to production**. Migrations and the `search-books` Edge Function deploy when changes merge to `main`.
2. **Auth:** Authentication → Sign In / Providers → Email is on by default. Leave "Confirm email" on or off as you prefer.
3. **App keys:** the project URL and publishable key are in the committed `.env` (they are public by design). Never commit secret keys; put anything private in `.env.local`, which is gitignored.

## Running

```bash
npm install
npx expo start        # scan the QR code with Expo Go, or press w for web
```
