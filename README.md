# Bill Manager (Vercel edition)

Scan shop bills with Azure Document Intelligence, review and save them,
search by date/vendor, physically verify items against what you actually
received, and set your own selling price per item.

This is the same app, fully ported from Netlify to **Vercel**:

| Piece | Was (Netlify) | Now (Vercel) |
|---|---|---|
| Hosting | Netlify | Vercel |
| Functions | Netlify Functions (`netlify/functions/*.mjs`) | Vercel Functions (`api/*.mjs`) |
| Database | Netlify DB (Postgres via Neon) | Vercel Postgres (also Neon-backed) or your own Neon project |
| File/log storage | Netlify Blobs | Vercel Blob |
| Scheduled cleanup | Netlify scheduled function (`@daily`) | Vercel Cron Job (`vercel.json`) |
| Auth | none (removed earlier) | none |

> **No login**, same as before. Anyone with the deployed URL can view and
> edit all bills. Don't share the link anywhere untrusted. Vercel's Hobby
> plan has a "Password Protection" / "Deployment Protection" feature under
> Project Settings if you want to gate access without building real auth.

---

## 1. Prerequisites

- A [Vercel](https://vercel.com) account (the Hobby/free plan is enough)
- A [GitHub](https://github.com) account (recommended, for auto-deploys)
- An [Azure](https://portal.azure.com) account with a **Document Intelligence** resource
- [Node.js](https://nodejs.org) 18+ installed locally
- The [Vercel CLI](https://vercel.com/docs/cli): `npm install -g vercel`

---

## 2. Azure Document Intelligence (unchanged from before)

1. Azure Portal → **Create a resource** → search **Document Intelligence** → Create.
2. Open the resource → **Keys and Endpoint**.
3. Copy the **Endpoint** and **Key 1** — you'll need both in step 6.

---

## 3. Push this project to GitHub

```bash
cd bill-manager
git init
git add .
git commit -m "Initial commit (Vercel version)"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

---

## 4. Create the Vercel project

```bash
vercel login
vercel link      # follow the prompts; creates/links a Vercel project to this folder
```

Or via the dashboard: **Add New… → Project → Import** your GitHub repo.
Vercel auto-detects this as a static site with serverless functions — no
build command or framework preset needed.

---

## 5. Create the database (Vercel Postgres, powered by Neon)

In the Vercel dashboard: your project → **Storage** tab → **Create Database**
→ **Postgres** (this is Neon under the hood, same engine as before). Connect
it to your project. Vercel automatically injects a `POSTGRES_URL`
environment variable — you don't need to copy/paste a connection string.

*(Alternative: if you'd rather keep a standalone Neon project instead, create
one at [neon.tech](https://neon.tech), grab its connection string, and set it
as `DATABASE_URL` in step 7 instead of using Vercel's Postgres storage.)*

### Load the schema

Run `schema.sql` once against this database. Easiest way: Vercel dashboard →
Storage → your database → **Query** tab → paste the contents of `schema.sql`
→ run. Or via `psql` if you copy the connection string from the database's
`.env.local` tab:

```bash
psql "<paste-the-connection-string>" -f schema.sql
```

---

## 6. Create the Blob store (for daily log files)

In the Vercel dashboard: your project → **Storage** tab → **Create Database**
→ **Blob**. Connect it to your project. This auto-injects
`BLOB_READ_WRITE_TOKEN` — again, no manual copying needed.

---

## 7. Set the remaining environment variables

In the Vercel dashboard: your project → **Settings → Environment Variables**, add:

| Key | Value |
|---|---|
| `AZURE_ENDPOINT` | Your Document Intelligence endpoint |
| `AZURE_API_KEY` | Your Document Intelligence key |
| `CRON_SECRET` | A long random string. Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

`POSTGRES_URL` and `BLOB_READ_WRITE_TOKEN` are already set by steps 5 and 6.

For local dev, copy `.env.example` to `.env.local` and fill in the same
values, or run `vercel env pull .env.local` to pull the real ones down from
your linked project.

---

## 8. Install dependencies and run locally

```bash
npm install
vercel dev
```

Open the printed local URL (usually `http://localhost:3000`), upload a test
bill, and confirm it scans, saves, and appears in search.

---

## 9. Deploy

If your project is linked to GitHub, just push:

```bash
git push
```

Vercel builds and deploys automatically on every push to `main`. Or deploy manually:

```bash
vercel --prod
```

---

## 10. Using the app

Identical to before:

1. **Scan / Upload Bill** — pick a JPG/PNG/PDF. Azure extracts vendor, date,
   GST, totals, and line items. Review/edit, then **Save Bill**.
2. The **vendor dropdown** fills in automatically from vendors you've saved bills for.
3. **Search** by date range and/or vendor.
4. Click a result to expand it, tick items as **physically verified**, and
   enter/save a **selling price** per item.
5. A bill shows `✓ VERIFIED` once every item on it is checked.

---

## 11. Logging (Vercel Cron + Vercel Blob)

Every function call (a scan, a save, a search, a verification update, a price
update) appends one line to that day's log file, stored in Vercel Blob under
the `logs/` prefix — e.g. `logs/2026-09-20.log`. A day's file is only created
the first time the app is used that day.

Cleanup is handled by `api/cron/cleanup-logs.mjs`, declared as a **Vercel
Cron Job** in `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/cleanup-logs", "schedule": "0 0 * * *" }] }
```

This runs automatically once a day (midnight UTC) and deletes any log file
older than 30 days — no manual intervention needed. Vercel's Hobby plan
supports cron jobs limited to once-daily execution, which is exactly what
this needs.

**Reading logs:** for now, the simplest way is the Vercel dashboard's Blob
browser (Storage → your Blob store → browse the `logs/` folder). An in-app
log viewer would be a small addition on top of `lib/logger.mjs` if you want one later.

---

## 12. Project structure

```
bill-manager/
├── index.html                     # entire frontend (inline CSS + JS)
├── vercel.json                    # declares the daily cron job
├── package.json                   # function dependencies
├── schema.sql                     # Postgres schema (run once)
├── .env.example                   # local dev environment template
├── lib/
│   ├── db.mjs                     # Postgres (Neon) connection
│   └── logger.mjs                 # daily log file read/write + 30-day cleanup logic
└── api/
    ├── scan-bill.mjs              # POST /api/scan-bill      (calls Azure)
    ├── bills-save.mjs             # POST /api/bills-save
    ├── bills-list.mjs             # GET  /api/bills-list?from=&to=&vendor=
    ├── bills-get.mjs              # GET  /api/bills-get?id=
    ├── bills-verify.mjs           # POST /api/bills-verify
    ├── items-price.mjs            # POST /api/items-price
    ├── vendors-list.mjs           # GET  /api/vendors-list
    └── cron/
        └── cleanup-logs.mjs       # GET  /api/cron/cleanup-logs (called daily by Vercel Cron)
```

Note: any file directly under `api/` becomes a public route automatically on
Vercel (that's why the shared `db.mjs` and `logger.mjs` live in `lib/`
instead — files outside `api/` are never turned into routes).

---

## 13. Notes, limits, and next steps

- **Request body size:** Vercel Functions cap request bodies around 4.5 MB.
  A base64-encoded image is ~33% larger than the original file, so keep
  uploaded bill photos under roughly 3 MB to stay safely under that limit.
  If you hit this, compress the photo before uploading or resize it.
- **No auth / single-tenant:** same caveat as before — everyone with the URL
  shares the same data. Use Vercel's Deployment Protection if you need to
  restrict access without building real login.
- **Free-tier ceilings worth knowing:** Vercel Hobby's Postgres and Blob
  storage both have small free allowances (a few hundred MB to a GB range)
  and Cron Jobs are limited to once-daily triggers on Hobby — all of which
  this app already respects by design.
- **Not included yet, worth adding later:**
  - Storing the original scanned image/PDF (Vercel Blob could hold these too, same pattern as the logs).
  - CSV/PDF export of purchase vs. sales margins.
  - An in-app screen to browse/download the daily log files.
