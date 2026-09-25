# Flashcards

Personal flashcards web app. Vanilla HTML/CSS/JS — no build step, no framework, no server required. Installs to your iPhone (or any) home screen as a PWA. Data lives in the browser; optional sync via a private GitHub Gist.

## Features

- Multiple categories, add on the fly
- Add / edit / delete cards per category
- Study mode with weighted-random selection:
  - Every card starts at weight `1.0`
  - Wrong → weight × 2 (cap 8) — comes back sooner
  - Right → weight × 0.5 (floor 0.25) — comes back less
- Optional private-Gist sync so data survives across devices / browser resets
- JSON export/import as a manual backup
- Seed categories: Latin (words, phrases, declensions, conjugations) and AI/ML (terms, architectures, popular LLMs)
- Works offline once installed
- Zero dependencies at runtime

## Local development

Any static HTTP server will do. Two easy options from the project root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```

> The service worker only registers over `http(s)`, so opening `index.html` via `file://` won't give you PWA behavior. `localhost` works.

## Hosting (free, private repo)

**GitHub Pages requires a public repo on free plans.** For a private repo, the easiest free hosts are:

1. **Cloudflare Pages** — connect your private GitHub repo, framework preset "None", build command empty, output directory `/`. Deploys on every push. Free, HTTPS, no bandwidth cap for personal use.
2. **Netlify** — same shape: connect the repo, publish directory `.`, no build command.
3. **Vercel** — same, framework "Other".

Any of the three works with a private GitHub repo at $0.

## Install on iPhone

1. Deploy to one of the hosts above and get the HTTPS URL.
2. Open the URL in **Safari** (not Chrome — only Safari can install PWAs on iOS).
3. Tap the Share button → **Add to Home Screen** → Add.
4. Launch it from the home screen icon. It runs full-screen, no browser chrome, and works offline.

Same steps work on Android in Chrome (menu → "Install app" or "Add to Home Screen").

## Sync setup (optional)

1. Create a GitHub Personal Access Token with the **`gist`** scope only:
   github.com/settings/tokens → Generate new token (classic) → check `gist` → generate → copy.
2. In the app, tap Settings → paste the token → leave Gist ID blank the first time → tap **Push now**. The app creates a private Gist and stores the ID for you.
3. On other devices: paste the same token + the Gist ID shown in settings → **Pull now**.
4. Turn on "Auto-push after every change" if you want writes to sync automatically (3-second debounce).

Merge strategy is intentionally simple (last-write-wins on the whole blob), so avoid editing on two devices simultaneously without pulling in between.

> The token is stored in `localStorage`. On a shared device, don't enable sync — or use a token with `gist`-only scope so leakage can't touch your repos.

## File layout

```
flashcards/
├── index.html         # shell
├── styles.css         # dark + light styles via prefers-color-scheme
├── app.js             # all app logic (~450 lines)
├── seed.js            # starter categories (Latin + AI/ML)
├── manifest.json      # PWA manifest
├── sw.js              # service worker (offline cache)
├── icons/             # PNG icons (regenerate with scripts/generate-icons.py)
└── scripts/
    └── generate-icons.py   # stdlib-only PNG icon generator
```

## Editing seed data

The `SEED_CATEGORIES` array in `seed.js` is only used on first load and after "Reset to seed data" in settings. Once you've added your own cards, editing `seed.js` won't touch them.

## Bumping the service worker

If you change `styles.css` / `app.js` and the browser still serves the old file, bump `CACHE` in `sw.js` (e.g. `'flashcards-v1'` → `'flashcards-v2'`) and reload twice.
