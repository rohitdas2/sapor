# Sapor

A mobile-first web app for tracking, ranking and discovering Trader Joe's food and drink products.
Sapor is an independent community app and is **not affiliated with Trader Joe's**.

## Modes

Without Supabase env vars, the app runs as a **clearly labeled local demo**:

- All data persists in the browser's `localStorage` (`sapor:local-demo:v1`).
- Sign-in uses only a display name and email. **No password is checked.** Accounts exist only in that browser.
- Shared collection links only open in the browser where they were made.
- Review photos are validated (JPEG/PNG/WebP, ≤ 8 MB, ≤ 4 per review), downscaled and stored as data URLs.
- The privacy rules are applied in code (`src/lib/data/local-store.ts`), so the UI behaves as it will in production. Locally they are **not** a security boundary.
- **Community → Load sample community** adds three accounts badged "Demo data", with sample reviews and rankings. Nothing is seeded unless you ask for it. **Remove sample community** deletes all of it.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## What works

- Searchable catalog with category filters, a "New to the catalog" section and a "Community favorites" section. Favorites appear only for products in the top 3 of public rankings from at least two people.
- One-tap **Want to try** / **Tried**. After marking tried, a sheet offers to add it to a ranking. Notes, photos and rankings are all optional.
- **Guided ranking (no star ratings):** adding a product to a ranking asks "Which did you prefer?" against well-chosen items (binary insertion, about log2(n) questions). Answers are Prefer this, Prefer that, About the same (tie) or I'm not sure (try a different item). You can leave an item unplaced and come back later. The placement is shown for confirmation, with Compare again and Adjust by hand. Every answer is stored in `comparisons`, and the confirmed order is the source of truth.
- Product page: your status, private notes, rankings, photo review (public or "only me"), community reviews, public rankings containing the product.
- My list: Tried, Want to try and Rankings tabs, with search, category filter and sort.
- Ranked collections:
  - Create, rename, describe and delete them.
  - Switch between public and private.
  - Pin one to your profile as Favorites.
  - Share via the native share sheet or by copying the link.
  - Reorder by drag-and-drop (pointer, touch or keyboard) or with ↑/↓ buttons. Each reorder is saved as one write.
- Profiles show pinned favorites, public rankings and recent public activity. On your own profile, a dashed "Only you can see this" panel adds want-to-try and notes counts plus private rankings.
- Discover includes "From the community": a chronological feed of public reviews and public rankings that have placed items. `/community` redirects there.

### Rules enforced

- No numeric ratings anywhere. Opinions live in per-collection placements, and ties share a rank.
- Each ranking is independent. Placing or reordering in one never touches another.
- A product can be tried with no review or ranking.
- Community favorites appear only for products in the top 3 of public rankings from at least two people.
- Notes, tracking status, comparisons and private collections or reviews are never returned for other users.

## Project layout

```
src/lib/types.ts              domain types
src/lib/data/store.ts         SaporStore interface + validation (the seam for backends)
src/lib/data/local-store.ts   local demo implementation
src/lib/data/provider.tsx     React context + useQuery hook
src/data/catalog.json         curated starter catalog (single source for demo + seed)
src/app/…                     Discover, product, My list, collection, community, profile, login, about
supabase/migrations/…         Postgres schema, RLS, RPCs, storage buckets/policies
supabase/seed.sql             generated catalog seed (node scripts/generate-seed.mjs)
```

## Catalog data

- **Instagram posts:** add `"instagramUrl": "https://www.instagram.com/p/<id>/"` to a product in `src/data/catalog.json`, or set `products.instagram_url` in Supabase. The product page then shows it through Instagram's official embed, so nothing is copied. Only `/p/` and `/reel/` permalinks are accepted. No URLs are filled in yet.

The 30 products use well-known names and short general descriptions. The catalog includes:

- No prices or stock information.
- `availability` set to `unknown`, except for products widely known as seasonal releases.
- `last_verified_at` left null, because nothing has been checked against the retailer's site yet.
- Product images are emoji illustrations. Real product photos need permission first, then go in `products.image_path`.

## Connecting Supabase

`src/lib/data/supabase-store.ts` implements the same `SaporStore` interface with `@supabase/supabase-js`.
`createStore()` in `src/lib/data/provider.tsx` uses it automatically when both env vars are set, and falls back to the local demo otherwise.

**Status:** it typechecks and builds, but **has not been run against a live Supabase project**. The migration hasn't been applied anywhere yet either. Expect a round of fixes the first time it's connected.

Setup:

1. Create a Supabase project. Run `supabase/migrations/20261018000000_init.sql` (`supabase db push` or the SQL editor), then `supabase/seed.sql`.
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put the service-role key in client code.
3. In Auth settings, decide on email confirmation. If it's on, sign-up shows "Check your email to confirm…" and the user signs in after confirming.
4. Make yourself an admin to manage the catalog: `update profiles set is_admin = true where id = '<your user id>';`

How it maps to the schema:

- Collection add, remove and reorder go through the `add_to_collection`, `remove_from_collection` and `save_collection_order` RPCs, so each one is a single transaction.
- Community favorites come from the `community_top_picks` view, which reads public rankings only. Guided-placement answers go in `comparisons`, which only the owner can access.
- Review photos upload to `review-media/<user id>/<uuid>.<ext>`. Uploads are validated client-side and limited by bucket type and size rules. If saving a review fails partway, uploaded files are cleaned up.

Before launch:

- Consider a private `review-media` bucket with signed URLs (see the note at the end of the migration).
- Add server-side routes for anything that needs secrets, such as importing the admin catalog.
- Generate typed bindings with `supabase gen types typescript`.

## Deferred

These are out of scope for this version:

- Native apps
- Video, plus `media_type = 'video'` handling, which the schema reserves
- Recommendations
- Messaging and notifications
- Barcode scanning
- Price and inventory tracking
- Other retailers (the schema has `retailers`)
- Payments
- Pairwise ranking
