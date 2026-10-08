# Hippocampus Books

A book reading tracker. Search for books (or add them by hand), put them on your pile, and mark each one *Want to read*, *Reading* or *Read*. Finished books get a 1–5 star rating.

Expo (React Native) + Supabase. See [`CLAUDE.md`](CLAUDE.md) for the architecture and conventions.

## Screens

- **Search:** searches your own catalog and Open Library. Tap **Add** to put a book on your pile. If a book can't be found, **Add a book manually**.
- **My Pile:** filter by status; tap a status to change it. *Read* books show stars (tap the current star again to clear it).
- **Book page:** tap any book in Search or My Pile to see its description, series and number, authors, subjects and editions, and to add it or change its status. Tap the series to see every book in it, in order.

## Supabase setup (one time)

1. **GitHub integration:** Project Settings → Integrations → GitHub. Connect this repo, set the **working directory** to `.` (the repo root, where the `supabase/` folder is), **Production branch** to `main`, and turn on **Deploy to production**. Migrations and Edge Functions deploy when changes merge to `main`.
2. **Auth:** Authentication → Sign In / Providers → Email is on by default. Leave "Confirm email" on or off as you prefer.
3. **App keys:** the project URL and publishable key are in the committed `.env` (they are public by design). Never commit secret keys; put anything private in `.env.local`, which is gitignored.

## Running

```bash
npm install
npx expo start        # scan the QR code with Expo Go, or press w for web
```

## Troubleshooting Expo Go

Expo Go loads the app from `npx expo start` running on your computer, so the phone has to be able to reach the computer.

**"Taking too long to load" after scanning the QR code.** Look at the terminal running `npx expo start`:

- **No new lines appear:** the phone can't reach the computer. Use tunnel mode (below).
- **"Bundling … %" appears:** the connection works; the first load is just slow. Wait for 100% (up to a minute the first time). If it stops with an error, that error is the real problem.

**Tunnel mode** routes the connection through the internet instead of your local network, so it works on almost any network (it's a little slower):

```bash
npx expo start --tunnel --clear
```

If it asks to install `@expo/ngrok`, say yes, then scan the new QR code.

**To use your local network instead,** check for these common blockers:

- The phone and computer are on different Wi-Fi networks (for example a guest network, or separate 2.4 GHz and 5 GHz networks).
- A VPN is on, on either device.
- The computer's firewall blocks port 8081. On Windows, set your Wi-Fi network to **Private** and allow Node.js when asked.
- Work, school or public Wi-Fi blocks devices from talking to each other.

**Other problems:**

- **"Incompatible SDK version":** this project uses Expo SDK 57. Update Expo Go from the App Store or Play Store.
- **Old code or old settings still showing:** restart with `--clear`, e.g. `npx expo start --clear`.
- **After pulling new changes:** run `npm install` first, since new packages may have been added.
