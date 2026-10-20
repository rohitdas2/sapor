import "server-only";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fromGroups, rankNumbers, toGroups } from "@/lib/ranking";
import { scoresFor, round1, type TierRow } from "@/lib/scores";
import type {
  Collection,
  CollectionWithItems,
  Comment,
  CommunityPick,
  ComparisonResult,
  FeedEntry,
  OrderEntry,
  Product,
  Profile,
  PublicReview,
  Review,
  ScoreStats,
  Tier,
  TopRated,
  UserProduct,
  Visibility,
} from "@/lib/types";
import type { Viewer } from "./auth";
import { db, now, transaction, UPLOAD_DIR, uuid } from "./db";
import { badRequest, forbidden, notFound } from "./http";

/**
 * Data access with the privacy rules applied in one place (SQLite has no RLS):
 *  - tracking rows, notes, tiers, comparisons: owner only
 *  - collections / reviews: public, or owner
 *  - scores count toward community stats only when the user opted in (profiles.share_scores)
 *  - writes always scope to viewer.id
 */

type Row = Record<string, unknown>;
const q = <T = Row>(sql: string, ...args: (string | number | null)[]) => db().prepare(sql).all(...args) as T[];
const one = <T = Row>(sql: string, ...args: (string | number | null)[]) => db().prepare(sql).get(...args) as T | undefined;
const run = (sql: string, ...args: (string | number | null)[]) => db().prepare(sql).run(...args);
const placeholders = (n: number) => Array(n).fill("?").join(",");

// ---------------------------------------------------------------- mapping
function toProduct(r: Row): Product {
  return {
    id: r.id as string,
    retailerId: r.retailer_id as string,
    name: r.name as string,
    slug: r.slug as string,
    category: r.category as Product["category"],
    description: r.description as string,
    imageUrl: null,
    imageIsPlaceholder: true,
    emoji: (r.emoji as string) ?? null,
    photo: r.photo_url
      ? { url: r.photo_url as string, credit: (r.photo_credit as string) ?? "Unknown", license: r.photo_license as string, source: r.photo_source as string }
      : null,
    instagramUrl: (r.instagram_url as string) ?? null,
    availability: r.availability as Product["availability"],
    sourceUrl: (r.source_url as string) ?? null,
    lastVerifiedAt: (r.last_verified_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toProfile(r: Row, includePrivate = false): Profile {
  return {
    id: r.user_id as string,
    displayName: r.display_name as string,
    avatarUrl: r.avatar_media_id ? `/api/media/${r.avatar_media_id}` : null,
    bio: (r.bio as string) ?? null,
    pinnedCollectionId: (r.pinned_collection_id as string) ?? null,
    isDemo: false,
    ...(includePrivate ? { shareScores: !!r.share_scores } : {}),
    createdAt: r.created_at as string,
  };
}

const profilesById = (ids: string[]) => {
  if (!ids.length) return new Map<string, Profile>();
  const rows = q(`SELECT * FROM profiles WHERE user_id IN (${placeholders(ids.length)})`, ...ids);
  return new Map(rows.map((r) => [r.user_id as string, toProfile(r)]));
};

const productsById = (ids: string[]) => {
  if (!ids.length) return new Map<string, Product>();
  const rows = q(`SELECT * FROM products WHERE id IN (${placeholders(ids.length)})`, ...ids);
  return new Map(rows.map((r) => [r.id as string, toProduct(r)]));
};

function assertProduct(productId: string) {
  if (!one("SELECT 1 FROM products WHERE id = ?", productId)) throw notFound("Unknown product.");
}

// ---------------------------------------------------------------- catalog
export function listProducts(qText?: string | null, category?: string | null): Product[] {
  const where: string[] = [];
  const args: string[] = [];
  if (category) {
    where.push("category = ?");
    args.push(category);
  }
  if (qText?.trim()) {
    const like = `%${qText.trim().toLowerCase().replace(/[%_]/g, "")}%`;
    where.push("(lower(name) LIKE ? OR lower(description) LIKE ?)");
    args.push(like, like);
  }
  return q(`SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name`, ...args).map(toProduct);
}

export function getProductBySlug(slug: string) {
  const r = one("SELECT * FROM products WHERE slug = ?", slug);
  return r ? toProduct(r) : null;
}

export function newAdditions(limit: number) {
  return q("SELECT * FROM products ORDER BY created_at DESC, name LIMIT ?", limit).map(toProduct);
}

// ---------------------------------------------------------------- scores
function tierRows(userId: string): TierRow[] {
  return q<Row>("SELECT product_id, tier, tier_position, tied_with_prev FROM user_products WHERE user_id = ? AND tier IS NOT NULL", userId).map(
    (r) => ({ productId: r.product_id as string, tier: r.tier as Tier, tierPosition: r.tier_position as number | null, tiedWithPrev: !!r.tied_with_prev }),
  );
}

/** Community stats from people who opted in to sharing scores. Computed on read; cache when this gets big. */
function sharedScores(productIds?: string[]): Map<string, number[]> {
  const sharers = q<{ user_id: string }>("SELECT user_id FROM profiles WHERE share_scores = 1").map((r) => r.user_id);
  const out = new Map<string, number[]>();
  for (const uid of sharers) {
    scoresFor(tierRows(uid)).forEach((score, pid) => {
      if (productIds && !productIds.includes(pid)) return;
      out.set(pid, [...(out.get(pid) ?? []), score]);
    });
  }
  return out;
}

const stats = (scores: number[] | undefined): ScoreStats =>
  scores?.length ? { average: round1(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length } : { average: null, count: 0 };

export function scoreStats(productId: string): ScoreStats {
  return stats(sharedScores([productId]).get(productId));
}

export function topRated(limit: number): TopRated[] {
  const all = [...sharedScores().entries()].filter(([, s]) => s.length >= 2);
  const products = productsById(all.map(([pid]) => pid));
  return all
    .map(([pid, s]) => ({ product: products.get(pid)!, stats: stats(s) }))
    .filter((x) => x.product)
    .sort((a, b) => b.stats.average! - a.stats.average! || b.stats.count - a.stats.count)
    .slice(0, limit);
}

/** Products in the top 3 of public rankings from ≥2 people. Real activity only. */
export function communityFavorites(limit: number): CommunityPick[] {
  const owners = new Map<string, Set<string>>();
  for (const c of q<{ id: string; owner_id: string }>("SELECT id, owner_id FROM collections WHERE visibility = 'public'")) {
    const order = placedOrder(c.id);
    const ranks = rankNumbers(order);
    order.forEach((e, i) => {
      if (ranks[i] <= 3) owners.set(e.productId, (owners.get(e.productId) ?? new Set()).add(c.owner_id));
    });
  }
  const picks = [...owners.entries()].filter(([, o]) => o.size >= 2);
  const products = productsById(picks.map(([pid]) => pid));
  return picks
    .map(([pid, o]) => ({ product: products.get(pid)!, topThreeCount: o.size }))
    .filter((x) => x.product)
    .sort((a, b) => b.topThreeCount - a.topThreeCount || a.product.name.localeCompare(b.product.name))
    .slice(0, limit);
}

// ---------------------------------------------------------------- tracking (private)
function toUserProduct(r: Row, scores: Map<string, number>): UserProduct {
  return {
    userId: r.user_id as string,
    productId: r.product_id as string,
    status: r.status as UserProduct["status"],
    tier: (r.tier as Tier) ?? null,
    tierPosition: (r.tier_position as number) ?? null,
    tiedWithPrev: !!r.tied_with_prev,
    score: scores.get(r.product_id as string) ?? null,
    notes: (r.notes as string) ?? null,
    firstTriedOn: (r.first_tried_on as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function myUserProducts(v: Viewer): UserProduct[] {
  const scores = scoresFor(tierRows(v.id));
  return q("SELECT * FROM user_products WHERE user_id = ?", v.id).map((r) => toUserProduct(r, scores));
}

export function myUserProduct(v: Viewer, productId: string): UserProduct | null {
  const r = one("SELECT * FROM user_products WHERE user_id = ? AND product_id = ?", v.id, productId);
  return r ? toUserProduct(r, scoresFor(tierRows(v.id))) : null;
}

export function upsertUserProduct(v: Viewer, productId: string, patch: { status?: unknown; notes?: unknown }) {
  assertProduct(productId);
  const existing = one("SELECT * FROM user_products WHERE user_id = ? AND product_id = ?", v.id, productId);
  const status = patch.status === undefined ? ((existing?.status as string) ?? "want_to_try") : patch.status;
  if (status !== "want_to_try" && status !== "tried") throw badRequest("status must be want_to_try or tried.");
  let notes = existing?.notes ?? null;
  if (patch.notes !== undefined) {
    if (patch.notes !== null && typeof patch.notes !== "string") throw badRequest("notes must be text.");
    notes = (patch.notes as string | null)?.trim().slice(0, 2000) || null;
  }
  const t = now();
  transaction(() => {
    if (existing) {
      run(
        "UPDATE user_products SET status = ?, notes = ?, first_tried_on = COALESCE(first_tried_on, ?), updated_at = ? WHERE user_id = ? AND product_id = ?",
        status, notes as string | null, status === "tried" ? t.slice(0, 10) : null, t, v.id, productId,
      );
      // Moving back to want-to-try removes it from the scored ranking.
      if (status === "want_to_try" && existing.tier) removeFromTier(v.id, productId);
    } else {
      run(
        "INSERT INTO user_products (user_id, product_id, status, notes, first_tried_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        v.id, productId, status, notes as string | null, status === "tried" ? t.slice(0, 10) : null, t, t,
      );
    }
  });
  return myUserProduct(v, productId)!;
}

export function untrack(v: Viewer, productId: string) {
  run("DELETE FROM user_products WHERE user_id = ? AND product_id = ?", v.id, productId);
}

// ---------------------------------------------------------------- overall taste ranking (drives scores)
function tierOrder(userId: string, tier: Tier): OrderEntry[] {
  return q<Row>(
    "SELECT product_id, tied_with_prev FROM user_products WHERE user_id = ? AND tier = ? AND tier_position IS NOT NULL ORDER BY tier_position",
    userId, tier,
  ).map((r) => ({ productId: r.product_id as string, tiedWithPrev: !!r.tied_with_prev }));
}

function writeTierOrder(userId: string, tier: Tier, order: OrderEntry[]) {
  order.forEach((e, i) =>
    run(
      "UPDATE user_products SET tier = ?, tier_position = ?, tied_with_prev = ?, updated_at = ? WHERE user_id = ? AND product_id = ?",
      tier, i, i > 0 && e.tiedWithPrev ? 1 : 0, now(), userId, e.productId,
    ),
  );
}

function removeFromTier(userId: string, productId: string) {
  const row = one<{ tier: Tier | null }>("SELECT tier FROM user_products WHERE user_id = ? AND product_id = ?", userId, productId);
  if (!row?.tier) return;
  const groups = toGroups(tierOrder(userId, row.tier)).map((g) => g.filter((p) => p !== productId)).filter((g) => g.length);
  run("UPDATE user_products SET tier = NULL, tier_position = NULL, tied_with_prev = 0 WHERE user_id = ? AND product_id = ?", userId, productId);
  writeTierOrder(userId, row.tier, fromGroups(groups));
}

/** Everything in one tier, best first, for the comparison flow. */
export function myTier(v: Viewer, tier: Tier) {
  const order = tierOrder(v.id, tier);
  const products = productsById(order.map((e) => e.productId));
  return order.map((e) => ({ ...e, product: products.get(e.productId)! }));
}

/** Confirm a product's placement: the tier's full order is replaced atomically. */
export function saveTierOrder(v: Viewer, tier: Tier, order: OrderEntry[]) {
  validateOrder(order);
  transaction(() => {
    for (const e of order) {
      const r = one<{ status: string; tier: Tier | null }>("SELECT status, tier FROM user_products WHERE user_id = ? AND product_id = ?", v.id, e.productId);
      if (!r || r.status !== "tried") throw badRequest("Only products you've tried can be scored.");
      if (r.tier && r.tier !== tier) removeFromTier(v.id, e.productId); // moving between tiers
    }
    const keep = new Set(order.map((e) => e.productId));
    for (const e of tierOrder(v.id, tier)) {
      if (!keep.has(e.productId)) throw badRequest("That order is missing items. Refresh and try again.");
    }
    writeTierOrder(v.id, tier, order);
  });
}

export function clearScore(v: Viewer, productId: string) {
  transaction(() => removeFromTier(v.id, productId));
}

function validateOrder(order: unknown): asserts order is OrderEntry[] {
  if (!Array.isArray(order) || order.length > 2000) throw badRequest("order must be a list.");
  const seen = new Set<string>();
  for (const e of order) {
    if (!e || typeof e.productId !== "string" || typeof e.tiedWithPrev !== "boolean" || seen.has(e.productId)) throw badRequest("Invalid order.");
    seen.add(e.productId);
  }
}

export function recordComparison(v: Viewer, input: { collectionId?: unknown; productId: unknown; otherProductId: unknown; result: unknown }) {
  const collectionId = input.collectionId == null ? null : String(input.collectionId);
  if (collectionId) ownCollection(v, collectionId);
  if (typeof input.productId !== "string" || typeof input.otherProductId !== "string") throw badRequest("productId and otherProductId are required.");
  const results: ComparisonResult[] = ["prefer_this", "prefer_that", "same", "unsure"];
  if (!results.includes(input.result as ComparisonResult)) throw badRequest("Invalid result.");
  run(
    "INSERT INTO comparisons (id, user_id, collection_id, product_id, other_product_id, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    uuid(), v.id, collectionId, input.productId, input.otherProductId, input.result as string, now(),
  );
}

// ---------------------------------------------------------------- collections
function placedOrder(collectionId: string): OrderEntry[] {
  return q<Row>("SELECT product_id, tied_with_prev FROM collection_items WHERE collection_id = ? AND position IS NOT NULL ORDER BY position", collectionId).map(
    (r) => ({ productId: r.product_id as string, tiedWithPrev: !!r.tied_with_prev }),
  );
}

function toCollection(r: Row): Collection {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    visibility: r.visibility as Visibility,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function hydrate(rows: Row[]): CollectionWithItems[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const items = q(
    `SELECT * FROM collection_items WHERE collection_id IN (${placeholders(ids.length)}) ORDER BY position IS NULL, position, added_at`,
    ...ids,
  );
  const products = productsById([...new Set(items.map((i) => i.product_id as string))]);
  const owners = profilesById([...new Set(rows.map((r) => r.owner_id as string))]);
  return rows.map((r) => ({
    ...toCollection(r),
    owner: owners.get(r.owner_id as string)!,
    items: items
      .filter((i) => i.collection_id === r.id)
      .map((i) => ({
        collectionId: r.id as string,
        productId: i.product_id as string,
        position: (i.position as number) ?? null,
        tiedWithPrev: !!i.tied_with_prev,
        addedAt: i.added_at as string,
        product: products.get(i.product_id as string)!,
      })),
  }));
}

function ownCollection(v: Viewer, id: string) {
  const c = one("SELECT * FROM collections WHERE id = ?", id);
  if (!c) throw notFound("Collection not found.");
  if (c.owner_id !== v.id) throw forbidden("You can only change your own collections.");
  return c;
}

const touch = (id: string) => run("UPDATE collections SET updated_at = ? WHERE id = ?", now(), id);

export function myCollections(v: Viewer) {
  return hydrate(q("SELECT * FROM collections WHERE owner_id = ? ORDER BY updated_at DESC", v.id));
}

export function getCollection(viewer: Viewer | null, id: string) {
  const r = one("SELECT * FROM collections WHERE id = ? AND (visibility = 'public' OR owner_id = ?)", id, viewer?.id ?? "");
  return r ? hydrate([r])[0] : null;
}

export function createCollection(v: Viewer, input: { title: string; description: string | null; visibility: Visibility }) {
  const id = uuid();
  const t = now();
  run("INSERT INTO collections (id, owner_id, title, description, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, v.id, input.title, input.description, input.visibility, t, t);
  return toCollection(one("SELECT * FROM collections WHERE id = ?", id)!);
}

export function updateCollection(v: Viewer, id: string, patch: { title?: string; description?: string | null; visibility?: Visibility }) {
  ownCollection(v, id);
  transaction(() => {
    if (patch.title !== undefined) run("UPDATE collections SET title = ? WHERE id = ?", patch.title, id);
    if (patch.description !== undefined) run("UPDATE collections SET description = ? WHERE id = ?", patch.description, id);
    if (patch.visibility !== undefined) {
      run("UPDATE collections SET visibility = ? WHERE id = ?", patch.visibility, id);
      if (patch.visibility === "private") run("UPDATE profiles SET pinned_collection_id = NULL WHERE pinned_collection_id = ?", id);
    }
    touch(id);
  });
}

export function deleteCollection(v: Viewer, id: string) {
  ownCollection(v, id);
  run("DELETE FROM collections WHERE id = ?", id);
}

export function addToCollection(v: Viewer, collectionId: string, productId: string) {
  ownCollection(v, collectionId);
  assertProduct(productId);
  return transaction(() => {
    const existing = one<{ position: number | null }>("SELECT position FROM collection_items WHERE collection_id = ? AND product_id = ?", collectionId, productId);
    if (existing) return { placed: existing.position != null };
    // First item in an empty ranking is its starting entry; others start unplaced.
    const placed = placedOrder(collectionId).length === 0;
    run("INSERT INTO collection_items (collection_id, product_id, position, tied_with_prev, added_at) VALUES (?, ?, ?, 0, ?)", collectionId, productId, placed ? 0 : null, now());
    touch(collectionId);
    return { placed };
  });
}

function writeCollectionOrder(collectionId: string, order: OrderEntry[]) {
  run("UPDATE collection_items SET position = NULL, tied_with_prev = 0 WHERE collection_id = ?", collectionId);
  order.forEach((e, i) =>
    run("UPDATE collection_items SET position = ?, tied_with_prev = ? WHERE collection_id = ? AND product_id = ?", i, i > 0 && e.tiedWithPrev ? 1 : 0, collectionId, e.productId),
  );
}

export function removeFromCollection(v: Viewer, collectionId: string, productId: string) {
  ownCollection(v, collectionId);
  transaction(() => {
    const groups = toGroups(placedOrder(collectionId)).map((g) => g.filter((p) => p !== productId)).filter((g) => g.length);
    run("DELETE FROM collection_items WHERE collection_id = ? AND product_id = ?", collectionId, productId);
    writeCollectionOrder(collectionId, fromGroups(groups));
    touch(collectionId);
  });
}

export function saveCollectionOrder(v: Viewer, collectionId: string, order: unknown) {
  ownCollection(v, collectionId);
  validateOrder(order);
  transaction(() => {
    const ids = new Set(q<{ product_id: string }>("SELECT product_id FROM collection_items WHERE collection_id = ?", collectionId).map((r) => r.product_id));
    if (!order.every((e) => ids.has(e.productId))) throw badRequest("That order doesn't match the collection. Refresh and try again.");
    writeCollectionOrder(collectionId, order);
    touch(collectionId);
  });
}

export function publicCollectionsForProduct(productId: string) {
  return hydrate(
    q(
      "SELECT c.* FROM collections c JOIN collection_items i ON i.collection_id = c.id WHERE c.visibility = 'public' AND i.product_id = ? ORDER BY c.updated_at DESC",
      productId,
    ),
  );
}

export function publicCollectionsByUser(userId: string) {
  return hydrate(q("SELECT * FROM collections WHERE owner_id = ? AND visibility = 'public' ORDER BY updated_at DESC", userId));
}

// ---------------------------------------------------------------- media
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 4;

function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Validates by file signature (not the client's claimed type) and stores under data/uploads/<owner>/. */
async function saveImage(v: Viewer, file: File) {
  if (file.size > MAX_PHOTO_BYTES) throw badRequest("Each photo must be under 8 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw badRequest("Photos must be JPEG, PNG or WebP.");
  const id = uuid();
  const key = `${v.id}/${id}.${kind.ext}`;
  mkdirSync(path.join(UPLOAD_DIR, v.id), { recursive: true });
  writeFileSync(path.join(UPLOAD_DIR, key), buf);
  return { id, key, mime: kind.mime, bytes: buf.length };
}

/** Media is visible to its owner, or when attached to a public post, or as an avatar. */
export function readableMedia(viewer: Viewer | null, id: string) {
  const m = one<{ owner_id: string; storage_key: string; mime: string }>("SELECT owner_id, storage_key, mime FROM media WHERE id = ? AND status = 'ready'", id);
  if (!m) return null;
  const visible =
    m.owner_id === viewer?.id ||
    !!one("SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.post_id WHERE pm.media_id = ? AND p.visibility = 'public' AND p.deleted_at IS NULL", id) ||
    !!one("SELECT 1 FROM profiles WHERE avatar_media_id = ?", id);
  return visible ? { path: path.join(UPLOAD_DIR, m.storage_key), mime: m.mime } : null;
}

// ---------------------------------------------------------------- reviews (posts of kind 'review')
function mediaFor(postIds: string[]) {
  if (!postIds.length) return new Map<string, Review["media"]>();
  const rows = q(`SELECT post_id, media_id, position FROM post_media WHERE post_id IN (${placeholders(postIds.length)}) ORDER BY position`, ...postIds);
  const out = new Map<string, Review["media"]>();
  for (const r of rows) {
    const list = out.get(r.post_id as string) ?? [];
    list.push({ id: r.media_id as string, reviewId: r.post_id as string, url: `/api/media/${r.media_id}`, mediaType: "image", displayOrder: r.position as number });
    out.set(r.post_id as string, list);
  }
  return out;
}

function toReviews(rows: Row[]): Review[] {
  const media = mediaFor(rows.map((r) => r.id as string));
  return rows.map((r) => ({
    id: r.id as string,
    authorId: r.author_id as string,
    productId: r.product_id as string,
    body: r.body as string,
    visibility: r.visibility as Visibility,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    media: media.get(r.id as string) ?? [],
  }));
}

function toPublicReviews(rows: Row[]): PublicReview[] {
  const authors = profilesById([...new Set(rows.map((r) => r.author_id as string))]);
  return toReviews(rows).map((r) => ({ ...r, author: authors.get(r.authorId)! }));
}

export function myReview(v: Viewer, productId: string) {
  const r = one("SELECT * FROM posts WHERE kind = 'review' AND author_id = ? AND product_id = ? AND deleted_at IS NULL", v.id, productId);
  return r ? toReviews([r])[0] : null;
}

export async function saveReview(v: Viewer, productId: string, input: { body: string; visibility: Visibility; photos: File[]; removeMediaIds: string[] }) {
  assertProduct(productId);
  if (!input.body && !input.photos.length) throw badRequest("Write something or add a photo.");
  const existing = myReview(v, productId);
  const kept = (existing?.media ?? []).filter((m) => !input.removeMediaIds.includes(m.id));
  if (kept.length + input.photos.length > MAX_PHOTOS) throw badRequest(`Up to ${MAX_PHOTOS} photos per review.`);
  const saved: Awaited<ReturnType<typeof saveImage>>[] = [];
  for (const f of input.photos) saved.push(await saveImage(v, f)); // files first; DB rows below are all-or-nothing
  const postId = existing?.id ?? uuid();
  const t = now();
  try {
    transaction(() => {
      if (existing) run("UPDATE posts SET body = ?, visibility = ?, updated_at = ? WHERE id = ?", input.body, input.visibility, t, postId);
      else run("INSERT INTO posts (id, author_id, kind, product_id, body, visibility, created_at, updated_at) VALUES (?, ?, 'review', ?, ?, ?, ?, ?)", postId, v.id, productId, input.body, input.visibility, t, t);
      for (const id of input.removeMediaIds) {
        const m = one<{ storage_key: string }>("SELECT m.storage_key FROM media m JOIN post_media pm ON pm.media_id = m.id WHERE m.id = ? AND pm.post_id = ? AND m.owner_id = ?", id, postId, v.id);
        if (!m) continue;
        run("DELETE FROM media WHERE id = ?", id);
        rmSync(path.join(UPLOAD_DIR, m.storage_key), { force: true });
      }
      kept.forEach((m, i) => run("UPDATE post_media SET position = ? WHERE post_id = ? AND media_id = ?", i, postId, m.id));
      saved.forEach((m, i) => {
        run("INSERT INTO media (id, owner_id, kind, mime, bytes, storage_key, created_at) VALUES (?, ?, 'image', ?, ?, ?, ?)", m.id, v.id, m.mime, m.bytes, m.key, t);
        run("INSERT INTO post_media (post_id, media_id, position) VALUES (?, ?, ?)", postId, m.id, kept.length + i);
      });
    });
  } catch (e) {
    saved.forEach((m) => rmSync(path.join(UPLOAD_DIR, m.key), { force: true }));
    throw e;
  }
  return myReview(v, productId)!;
}

export function deleteReview(v: Viewer, productId: string) {
  const r = myReview(v, productId);
  if (!r) return;
  transaction(() => {
    for (const m of r.media) {
      const row = one<{ storage_key: string }>("SELECT storage_key FROM media WHERE id = ?", m.id);
      run("DELETE FROM media WHERE id = ?", m.id);
      if (row) rmSync(path.join(UPLOAD_DIR, row.storage_key), { force: true });
    }
    run("DELETE FROM posts WHERE id = ?", r.id);
  });
}

export function publicReviewsForProduct(productId: string) {
  return toPublicReviews(q("SELECT * FROM posts WHERE kind = 'review' AND product_id = ? AND visibility = 'public' AND deleted_at IS NULL ORDER BY created_at DESC", productId));
}

// ---------------------------------------------------------------- comments
function toComments(rows: Row[]): Comment[] {
  const authors = profilesById([...new Set(rows.map((r) => r.author_id as string))]);
  return rows.map((r) => ({
    id: r.id as string,
    author: authors.get(r.author_id as string)!,
    body: r.body as string,
    createdAt: r.created_at as string,
    parentId: (r.parent_id as string) ?? null,
  }));
}

export function productComments(productId: string) {
  return toComments(q("SELECT * FROM comments WHERE target_type = 'product' AND target_id = ? AND deleted_at IS NULL ORDER BY created_at", productId));
}

export function addProductComment(v: Viewer, productId: string, body: string, parentId: string | null) {
  assertProduct(productId);
  if (parentId && !one("SELECT 1 FROM comments WHERE id = ? AND target_type = 'product' AND target_id = ? AND deleted_at IS NULL", parentId, productId)) {
    throw badRequest("That reply target no longer exists.");
  }
  const id = uuid();
  const t = now();
  run("INSERT INTO comments (id, author_id, target_type, target_id, parent_id, body, created_at, updated_at) VALUES (?, ?, 'product', ?, ?, ?, ?, ?)", id, v.id, productId, parentId, body, t, t);
  return toComments([one("SELECT * FROM comments WHERE id = ?", id)!])[0];
}

export function deleteComment(v: Viewer, id: string) {
  const c = one<{ author_id: string }>("SELECT author_id FROM comments WHERE id = ? AND deleted_at IS NULL", id);
  if (!c) throw notFound("Comment not found.");
  if (c.author_id !== v.id && v.role !== "admin") throw forbidden("You can only delete your own comments.");
  run("UPDATE comments SET deleted_at = ? WHERE id = ?", now(), id); // soft delete keeps reply threads intact
}

// ---------------------------------------------------------------- profiles + feed
export function getProfile(viewer: Viewer | null, userId: string) {
  const r = one("SELECT * FROM profiles WHERE user_id = ?", userId);
  return r ? toProfile(r, viewer?.id === userId) : null;
}

export function updateMyProfile(v: Viewer, patch: { displayName?: string; bio?: string | null; pinnedCollectionId?: string | null; shareScores?: boolean }) {
  if (patch.pinnedCollectionId) {
    const c = one("SELECT 1 FROM collections WHERE id = ? AND owner_id = ? AND visibility = 'public'", patch.pinnedCollectionId, v.id);
    if (!c) throw badRequest("Only your public collections can be pinned.");
  }
  transaction(() => {
    if (patch.displayName !== undefined) run("UPDATE profiles SET display_name = ? WHERE user_id = ?", patch.displayName, v.id);
    if (patch.bio !== undefined) run("UPDATE profiles SET bio = ? WHERE user_id = ?", patch.bio, v.id);
    if (patch.pinnedCollectionId !== undefined) run("UPDATE profiles SET pinned_collection_id = ? WHERE user_id = ?", patch.pinnedCollectionId, v.id);
    if (patch.shareScores !== undefined) run("UPDATE profiles SET share_scores = ? WHERE user_id = ?", patch.shareScores ? 1 : 0, v.id);
  });
}

export function feed(userId: string | null, limit: number): FeedEntry[] {
  const reviewRows = userId
    ? q("SELECT * FROM posts WHERE kind = 'review' AND visibility = 'public' AND deleted_at IS NULL AND author_id = ? ORDER BY updated_at DESC LIMIT ?", userId, limit)
    : q("SELECT * FROM posts WHERE kind = 'review' AND visibility = 'public' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?", limit);
  const products = productsById([...new Set(reviewRows.map((r) => r.product_id as string))]);
  const entries: FeedEntry[] = toPublicReviews(reviewRows).map((r) => ({ kind: "review", at: r.updatedAt, review: r, product: products.get(r.productId)! }));
  const colRows = userId
    ? q("SELECT * FROM collections WHERE visibility = 'public' AND owner_id = ? ORDER BY updated_at DESC LIMIT ?", userId, limit)
    : q("SELECT * FROM collections WHERE visibility = 'public' ORDER BY updated_at DESC LIMIT ?", limit);
  for (const c of hydrate(colRows)) {
    if (c.items.some((i) => i.position != null)) entries.push({ kind: "collection", at: c.updatedAt, collection: c });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
