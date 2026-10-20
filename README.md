# Sapor

A mobile-first web app for tracking, scoring, ranking and discovering Trader Joe's food and drink products.
Sapor is an independent community app and is **not affiliated with Trader Joe's**.

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first boot the SQLite database is created at `data/sapor.db`, migrations in `db/migrations/` run, and the starter catalog from `src/data/catalog.json` is loaded. Requires Node 22.13+ for the built-in `node:sqlite` driver.

## Architecture

```
Browser (Next.js client components)
  └─ ApiStore (src/lib/data/api-store.ts) — fetch, same-origin, session cookie
       └─ Route handlers (src/app/api/**/route.ts) — validation, auth checks, JSON
            └─ Repository (src/server/repo.ts) — every query applies privacy rules
                 └─ SQLite (node:sqlite, data/sapor.db) + uploads on disk (data/uploads)
```

- **Anonymous browsing:** anyone can browse the catalog, Discover, product pages, public reviews and rankings, comments and profiles. Saving, scoring, ranking, reviewing and commenting require an account, and the API returns 401 for any write without a session.
- **Auth** (`src/server/password.ts`, `src/server/auth.ts`):
  - Passwords are stored in one column as `algorithm$salt$hexdigest`, using scrypt with a random 16-byte salt per user, for example `scrypt:16384:8:1$<salt>$<hash>`. Login re-hashes salt plus candidate and compares in constant time.
  - scrypt is used instead of one SHA-512 round because it's deliberately slow and memory-hard. The cost parameters sit in the algorithm field, so they can be raised later; old hashes are re-hashed on the next login.
  - Sessions use a random 256-bit token in an httpOnly, SameSite=Lax cookie. Only its SHA-256 is stored, and sessions expire after 30 days.
  - All writes require a same-origin `Origin` header, which defends against CSRF.
  - Five failed logins per email lock that email out for 10 minutes. Unknown emails take the same time to reject as wrong passwords.
- **Scores (1–10, one decimal):**
  - Nobody types a number. You pick Loved / Fine / Didn't like, then guided "which did you prefer?" comparisons (binary insertion) place the product in that tier.
  - Each tier maps to a band: loved 7.0–10.0, fine 4.0–6.9, disliked 1.0–3.9. Position within the band sets the score (`src/lib/scores.ts`).
  - Scores are derived on read, never stored, so the confirmed order is the single source of truth.
  - Community averages and Top rated only include people who turn on **Share my scores**.
- **Rankings:** curated, ordered collections ("Best desserts") use the same comparison flow, support ties and unplaced items, and are independent of each other and of scores.
- **Content model built for the future:**
  - `posts.kind` is one of `review | hack | post | video`, with `post_products` for multi-product hacks and `post_media` plus `media` (image or video, with a `processing` status and poster frame).
  - `comments` is polymorphic (product, post or collection) and threaded.
  - `reactions`, `follows` and `reports` tables exist with no UI yet.
  - Only reviews and product comments are built today.

## API

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/signup` · `/api/auth/login` · `/api/auth/logout` | — |
| GET | `/api/auth/me` | optional |
| GET | `/api/products?q&category` · `/api/products/:slug` (+ community score) | public |
| GET | `/api/products/:slug/reviews` · `/collections` · `/comments` | public |
| POST | `/api/products/:slug/comments` · DELETE `/api/comments/:id` | user |
| GET | `/api/discover` (new, community favorites, top rated) · `/api/feed` | public |
| GET/PUT/DELETE | `/api/me/products/:productId` (want to try / tried / notes) | user |
| GET/PUT | `/api/me/tiers/:tier` (scored order) · DELETE `/api/me/products/:id/score` | user |
| POST | `/api/me/comparisons` | user |
| GET/PUT/DELETE | `/api/me/reviews/:productId` (multipart, ≤4 photos, signature-checked) | user |
| PATCH | `/api/me/profile` (name, bio, pinned ranking, share scores) | user |
| GET/POST | `/api/collections` · GET/PATCH/DELETE `/api/collections/:id` | public read for public collections |
| POST/DELETE | `/api/collections/:id/items[/:productId]` · PUT `/api/collections/:id/order` | owner |
| GET | `/api/users/:id` · `/api/users/:id/collections` | public |
| GET | `/api/media/:id` | owner, public post, or avatar |

## Catalog data

- 30 curated products with no prices or stock claims. `availability` is `unknown` unless a product is widely known to be seasonal.
- Photos are freely licensed Wikimedia Commons images of the general food type, credited on product pages. Products without one show an emoji.
- **Instagram:** add `"instagramUrl": "https://www.instagram.com/p/<id>/"` to a product in `catalog.json`. It's shown only through Instagram's official embed, so nothing is copied.

## Moving to production

- Swap SQLite for Postgres. The schema is written portably: UUID text ids, ISO timestamps and CHECK constraints. Then move the inline SQL in `repo.ts` behind the same functions.
- Move `data/uploads` to object storage, such as S3 or R2, keyed by `media.storage_key`.
- Move the login throttle to Redis when running more than one instance.
- Precompute community score aggregates when user counts grow. They're computed on read today.
- Add an admin UI for the catalog. Admins exist (`users.role`), but catalog edits are via `catalog.json` for now.
