"use client";

import type {
  Collection,
  CollectionItem,
  CollectionWithItems,
  FeedEntry,
  Product,
  Profile,
  PublicReview,
  RatingStats,
  Review,
  ReviewMedia,
  UserProduct,
} from "../types";
import { CATALOG, matchesFilter } from "./catalog";
import {
  MAX_PHOTOS_PER_REVIEW,
  type ReviewInput,
  type SaporStore,
  StoreError,
  type UserProductPatch,
  validatePhoto,
  validateRating,
} from "./store";

/**
 * LOCAL DEMO store. Persists to this browser's localStorage. It simulates the
 * production row-level-security rules in code so the UI behaves the same way,
 * but it is NOT a security boundary: anyone with the browser can read the raw data.
 */

const KEY = "sapor:local-demo:v1";

interface LocalUser extends Profile {
  email: string;
}

interface DB {
  users: LocalUser[];
  userProducts: UserProduct[];
  collections: Collection[];
  collectionItems: CollectionItem[];
  reviews: Omit<Review, "media">[];
  reviewMedia: ReviewMedia[];
  sessionUserId: string | null;
}

const empty = (): DB => ({
  users: [],
  userProducts: [],
  collections: [],
  collectionItems: [],
  reviews: [],
  reviewMedia: [],
  sessionUserId: null,
});

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const byProductId = new Map(CATALOG.map((p) => [p.id, p]));

export class LocalStore implements SaporStore {
  mode = "local-demo" as const;
  private db: DB;
  private listeners = new Set<() => void>();

  constructor() {
    this.db = this.load();
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        this.db = this.load();
        this.emit();
      }
    });
  }

  private load(): DB {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    } catch {
      return empty();
    }
  }

  /** Apply a mutation to a copy and persist it in one write (all-or-nothing). */
  private commit(mutate: (db: DB) => void) {
    const next: DB = structuredClone(this.db);
    mutate(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      throw new StoreError("This browser's storage is full. Try removing a photo or two.");
    }
    this.db = next;
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- auth ----------
  currentUserId() {
    return this.db.sessionUserId;
  }

  private requireUser(): string {
    const id = this.db.sessionUserId;
    if (!id) throw new StoreError("Sign in to do that.");
    return id;
  }

  async signUp({ email, displayName }: { email: string; password: string; displayName: string }) {
    const name = displayName.trim();
    const mail = email.trim().toLowerCase();
    if (!name) throw new StoreError("Pick a display name.");
    if (!mail.includes("@")) throw new StoreError("Enter an email address.");
    if (this.db.users.some((u) => u.email === mail)) throw new StoreError("That email already has a local account. Sign in instead.");
    const user: LocalUser = {
      id: uid(),
      email: mail,
      displayName: name.slice(0, 40),
      avatarUrl: null,
      bio: null,
      pinnedCollectionId: null,
      isDemo: false,
      createdAt: now(),
    };
    this.commit((db) => {
      db.users.push(user);
      db.sessionUserId = user.id;
    });
  }

  async signIn({ email }: { email: string; password: string }) {
    const user = this.db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user) throw new StoreError("No local account with that email on this browser.");
    this.commit((db) => {
      db.sessionUserId = user.id;
    });
  }

  async signOut() {
    this.commit((db) => {
      db.sessionUserId = null;
    });
  }

  /** Local demo only: accounts that exist in this browser, for quick switching. */
  localAccounts() {
    return this.db.users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, isDemo: u.isDemo }));
  }

  // ---------- catalog ----------
  async listProducts(filter: { q?: string; category?: string | null } = {}) {
    return CATALOG.filter((p) => matchesFilter(p, filter.q, filter.category)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProductBySlug(slug: string) {
    return CATALOG.find((p) => p.slug === slug) ?? null;
  }

  async newAdditions(limit: number) {
    return [...CATALOG].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  private publicRatings(productId?: string) {
    return this.db.userProducts.filter(
      (up) => up.ratingPublic && up.rating != null && up.status === "tried" && (!productId || up.productId === productId),
    );
  }

  async ratingStats(productId: string): Promise<RatingStats> {
    const rows = this.publicRatings(productId);
    if (!rows.length) return { count: 0, average: null };
    return { count: rows.length, average: rows.reduce((s, r) => s + (r.rating ?? 0), 0) / rows.length };
  }

  async communityFavorites(limit: number) {
    const groups = new Map<string, number[]>();
    for (const r of this.publicRatings()) {
      groups.set(r.productId, [...(groups.get(r.productId) ?? []), r.rating!]);
    }
    return [...groups.entries()]
      .filter(([, rs]) => rs.length >= 2)
      .map(([pid, rs]) => ({
        product: byProductId.get(pid)!,
        stats: { count: rs.length, average: rs.reduce((a, b) => a + b, 0) / rs.length },
      }))
      .filter((x) => x.product && (x.stats.average ?? 0) >= 4)
      .sort((a, b) => b.stats.average! - a.stats.average! || b.stats.count - a.stats.count)
      .slice(0, limit);
  }

  // ---------- tracking ----------
  async myUserProducts() {
    const me = this.db.sessionUserId;
    return me ? this.db.userProducts.filter((u) => u.userId === me) : [];
  }

  async myUserProduct(productId: string) {
    const me = this.db.sessionUserId;
    return this.db.userProducts.find((u) => u.userId === me && u.productId === productId) ?? null;
  }

  async setStatus(productId: string, status: UserProduct["status"]) {
    return this.updateUserProduct(productId, { status });
  }

  async updateUserProduct(productId: string, patch: UserProductPatch) {
    const me = this.requireUser();
    if (!byProductId.has(productId)) throw new StoreError("Unknown product.");
    validateRating(patch.rating);
    let result!: UserProduct;
    this.commit((db) => {
      const existing = db.userProducts.find((u) => u.userId === me && u.productId === productId);
      const t = now();
      if (existing) {
        Object.assign(existing, patch, { updatedAt: t });
        if (patch.status === "tried" && !existing.firstTriedOn) existing.firstTriedOn = t.slice(0, 10);
        result = existing;
      } else {
        result = {
          userId: me,
          productId,
          status: patch.status ?? "want_to_try",
          rating: patch.rating ?? null,
          ratingPublic: patch.ratingPublic ?? false,
          notes: patch.notes ?? null,
          firstTriedOn: patch.firstTriedOn ?? (patch.status === "tried" ? t.slice(0, 10) : null),
          createdAt: t,
          updatedAt: t,
        };
        db.userProducts.push(result);
      }
    });
    return result;
  }

  async untrack(productId: string) {
    const me = this.requireUser();
    this.commit((db) => {
      db.userProducts = db.userProducts.filter((u) => !(u.userId === me && u.productId === productId));
    });
  }

  // ---------- collections ----------
  private canSee(c: Collection) {
    return c.visibility === "public" || c.ownerId === this.db.sessionUserId;
  }

  private hydrate(c: Collection): CollectionWithItems {
    return {
      ...c,
      owner: this.profileOf(c.ownerId)!,
      items: this.db.collectionItems
        .filter((i) => i.collectionId === c.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, product: byProductId.get(i.productId)! }))
        .filter((i) => i.product),
    };
  }

  private ownCollection(db: DB, id: string) {
    const me = this.requireUser();
    const c = db.collections.find((x) => x.id === id);
    if (!c || c.ownerId !== me) throw new StoreError("You can only change your own collections.");
    return c;
  }

  async myCollections() {
    const me = this.db.sessionUserId;
    return this.db.collections
      .filter((c) => c.ownerId === me)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => this.hydrate(c));
  }

  async getCollection(id: string) {
    const c = this.db.collections.find((x) => x.id === id);
    return c && this.canSee(c) ? this.hydrate(c) : null;
  }

  async createCollection(input: { title: string; description?: string; visibility: Collection["visibility"] }) {
    const me = this.requireUser();
    const title = input.title.trim();
    if (!title) throw new StoreError("Give your collection a name.");
    const t = now();
    const c: Collection = {
      id: uid(),
      ownerId: me,
      title: title.slice(0, 80),
      description: input.description?.trim().slice(0, 280) || null,
      visibility: input.visibility,
      createdAt: t,
      updatedAt: t,
    };
    this.commit((db) => {
      db.collections.push(c);
    });
    return c;
  }

  async updateCollection(id: string, patch: Partial<Pick<Collection, "title" | "description" | "visibility">>) {
    if (patch.title !== undefined && !patch.title.trim()) throw new StoreError("Give your collection a name.");
    this.commit((db) => {
      const c = this.ownCollection(db, id);
      Object.assign(c, patch, { updatedAt: now() });
      if (patch.visibility === "private") {
        const owner = db.users.find((u) => u.id === c.ownerId);
        if (owner?.pinnedCollectionId === id) owner.pinnedCollectionId = null;
      }
    });
  }

  async deleteCollection(id: string) {
    this.commit((db) => {
      const c = this.ownCollection(db, id);
      db.collections = db.collections.filter((x) => x.id !== c.id);
      db.collectionItems = db.collectionItems.filter((i) => i.collectionId !== c.id);
      db.users.forEach((u) => {
        if (u.pinnedCollectionId === id) u.pinnedCollectionId = null;
      });
    });
  }

  async addToCollection(collectionId: string, productId: string) {
    if (!byProductId.has(productId)) throw new StoreError("Unknown product.");
    this.commit((db) => {
      const c = this.ownCollection(db, collectionId);
      const items = db.collectionItems.filter((i) => i.collectionId === collectionId);
      if (items.some((i) => i.productId === productId)) return; // no duplicates
      const position = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
      db.collectionItems.push({ collectionId, productId, position, addedAt: now() });
      c.updatedAt = now();
    });
  }

  async removeFromCollection(collectionId: string, productId: string) {
    this.commit((db) => {
      const c = this.ownCollection(db, collectionId);
      db.collectionItems = db.collectionItems.filter((i) => !(i.collectionId === collectionId && i.productId === productId));
      db.collectionItems
        .filter((i) => i.collectionId === collectionId)
        .sort((a, b) => a.position - b.position)
        .forEach((i, idx) => (i.position = idx));
      c.updatedAt = now();
    });
  }

  async reorderCollection(collectionId: string, productIds: string[]) {
    this.commit((db) => {
      const c = this.ownCollection(db, collectionId);
      const items = db.collectionItems.filter((i) => i.collectionId === collectionId);
      const current = new Set(items.map((i) => i.productId));
      if (productIds.length !== items.length || new Set(productIds).size !== productIds.length || !productIds.every((p) => current.has(p))) {
        throw new StoreError("That order doesn't match the collection. Refresh and try again.");
      }
      productIds.forEach((pid, idx) => {
        items.find((i) => i.productId === pid)!.position = idx;
      });
      c.updatedAt = now();
    });
  }

  async publicCollectionsForProduct(productId: string) {
    const ids = new Set(this.db.collectionItems.filter((i) => i.productId === productId).map((i) => i.collectionId));
    return this.db.collections
      .filter((c) => c.visibility === "public" && ids.has(c.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => this.hydrate(c));
  }

  async publicCollectionsByUser(userId: string) {
    return this.db.collections
      .filter((c) => c.ownerId === userId && c.visibility === "public")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => this.hydrate(c));
  }

  // ---------- reviews ----------
  private withMedia(r: Omit<Review, "media">): Review {
    return {
      ...r,
      media: this.db.reviewMedia.filter((m) => m.reviewId === r.id).sort((a, b) => a.displayOrder - b.displayOrder),
    };
  }

  private toPublic(r: Omit<Review, "media">): PublicReview {
    const up = this.db.userProducts.find((u) => u.userId === r.authorId && u.productId === r.productId);
    return {
      ...this.withMedia(r),
      author: this.profileOf(r.authorId)!,
      publicRating: up?.ratingPublic ? up.rating : null,
    };
  }

  async myReview(productId: string) {
    const me = this.db.sessionUserId;
    const r = this.db.reviews.find((x) => x.authorId === me && x.productId === productId);
    return r ? this.withMedia(r) : null;
  }

  async saveReview(productId: string, input: ReviewInput) {
    const me = this.requireUser();
    const body = input.body.trim();
    if (!body && !input.newPhotos?.length) throw new StoreError("Write something or add a photo.");
    if (body.length > 2000) throw new StoreError("Reviews are limited to 2,000 characters.");
    input.newPhotos?.forEach(validatePhoto);
    const existing = this.db.reviews.find((x) => x.authorId === me && x.productId === productId);
    const keptMedia = existing
      ? this.db.reviewMedia.filter((m) => m.reviewId === existing.id && !input.removeMediaIds?.includes(m.id))
      : [];
    if (keptMedia.length + (input.newPhotos?.length ?? 0) > MAX_PHOTOS_PER_REVIEW) {
      throw new StoreError(`Up to ${MAX_PHOTOS_PER_REVIEW} photos per review.`);
    }
    const urls = await Promise.all((input.newPhotos ?? []).map(compressImage));
    const reviewId = existing?.id ?? uid();
    const t = now();
    this.commit((db) => {
      const r = db.reviews.find((x) => x.id === reviewId);
      if (r) Object.assign(r, { body, visibility: input.visibility, updatedAt: t });
      else db.reviews.push({ id: reviewId, authorId: me, productId, body, visibility: input.visibility, createdAt: t, updatedAt: t });
      db.reviewMedia = db.reviewMedia.filter((m) => !(m.reviewId === reviewId && input.removeMediaIds?.includes(m.id)));
      const kept = db.reviewMedia.filter((m) => m.reviewId === reviewId).sort((a, b) => a.displayOrder - b.displayOrder);
      kept.forEach((m, i) => (m.displayOrder = i));
      urls.forEach((url, i) =>
        db.reviewMedia.push({ id: uid(), reviewId, url, mediaType: "image", displayOrder: kept.length + i }),
      );
    });
    return (await this.myReview(productId))!;
  }

  async deleteReview(productId: string) {
    const me = this.requireUser();
    this.commit((db) => {
      const r = db.reviews.find((x) => x.authorId === me && x.productId === productId);
      if (!r) return;
      db.reviews = db.reviews.filter((x) => x.id !== r.id);
      db.reviewMedia = db.reviewMedia.filter((m) => m.reviewId !== r.id);
    });
  }

  async publicReviewsForProduct(productId: string) {
    return this.db.reviews
      .filter((r) => r.productId === productId && r.visibility === "public")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => this.toPublic(r));
  }

  // ---------- profiles + feed ----------
  private profileOf(id: string): Profile | null {
    const u = this.db.users.find((x) => x.id === id);
    if (!u) return null;
    // Never leak email or other account fields through the public profile.
    const { email: _email, ...profile } = u;
    void _email;
    return profile;
  }

  async getProfile(userId: string) {
    return this.profileOf(userId);
  }

  async updateMyProfile(patch: Partial<Pick<Profile, "displayName" | "bio" | "avatarUrl" | "pinnedCollectionId">>) {
    const me = this.requireUser();
    if (patch.displayName !== undefined && !patch.displayName.trim()) throw new StoreError("Display name can't be empty.");
    if (patch.pinnedCollectionId) {
      const c = this.db.collections.find((x) => x.id === patch.pinnedCollectionId);
      if (!c || c.ownerId !== me || c.visibility !== "public") throw new StoreError("Only your public collections can be pinned.");
    }
    this.commit((db) => {
      const u = db.users.find((x) => x.id === me)!;
      Object.assign(u, {
        ...patch,
        displayName: patch.displayName?.trim().slice(0, 40) ?? u.displayName,
        bio: patch.bio === undefined ? u.bio : patch.bio?.trim().slice(0, 160) || null,
      });
    });
  }

  async feed({ userId, limit = 40 }: { userId?: string; limit?: number } = {}) {
    const entries: FeedEntry[] = [];
    for (const r of this.db.reviews) {
      if (r.visibility !== "public" || (userId && r.authorId !== userId)) continue;
      entries.push({ kind: "review", at: r.updatedAt, review: this.toPublic(r), product: byProductId.get(r.productId)! });
    }
    for (const c of this.db.collections) {
      if (c.visibility !== "public" || (userId && c.ownerId !== userId)) continue;
      const hydrated = this.hydrate(c);
      if (!hydrated.items.length) continue;
      entries.push({ kind: "collection", at: c.updatedAt, collection: hydrated });
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  // ---------- demo data ----------
  hasDemoData() {
    return this.db.users.some((u) => u.isDemo);
  }

  loadDemoCommunity() {
    if (this.hasDemoData()) return;
    const t = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
    const mk = (name: string, bio: string): LocalUser => ({
      id: uid(), email: `${name.toLowerCase().replace(/\W/g, "")}@demo.sapor.local`, displayName: name,
      avatarUrl: null, bio, pinnedCollectionId: null, isDemo: true, createdAt: t(30),
    });
    const a = mk("Demo · Juniper", "Sample account. Frozen-aisle optimist.");
    const b = mk("Demo · Marco", "Sample account. Sauce first, questions later.");
    const c = mk("Demo · Priya", "Sample account. Will rank any dessert.");
    const rate = (u: LocalUser, slug: string, rating: number, ago: number): UserProduct => ({
      userId: u.id, productId: `p-${slug}`, status: "tried", rating, ratingPublic: true,
      notes: "Demo note — private, never shown to others.", firstTriedOn: t(ago).slice(0, 10), createdAt: t(ago), updatedAt: t(ago),
    });
    const rv = (u: LocalUser, slug: string, body: string, ago: number) => ({
      id: uid(), authorId: u.id, productId: `p-${slug}`, body, visibility: "public" as const, createdAt: t(ago), updatedAt: t(ago),
    });
    const col = (u: LocalUser, title: string, slugs: string[], ago: number) => {
      const id = uid();
      return {
        c: { id, ownerId: u.id, title, description: "Demo collection (sample data).", visibility: "public" as const, createdAt: t(ago), updatedAt: t(ago) },
        items: slugs.map((s, i) => ({ collectionId: id, productId: `p-${s}`, position: i, addedAt: t(ago) })),
      };
    };
    const cols = [
      col(a, "Best frozen meals", ["mandarin-orange-chicken", "chicken-soup-dumplings", "kimbap", "cauliflower-gnocchi"], 3),
      col(b, "Sauces worth the fridge space", ["chili-onion-crunch", "zhoug-sauce", "green-goddess-dressing"], 5),
      col(c, "Desserts, ranked", ["hold-the-cone", "dark-chocolate-peanut-butter-cups", "mochi-ice-cream", "joe-joes"], 1),
    ];
    a.pinnedCollectionId = cols[0].c.id;
    c.pinnedCollectionId = cols[2].c.id;
    this.commit((db) => {
      db.users.push(a, b, c);
      db.userProducts.push(
        rate(a, "mandarin-orange-chicken", 5, 6), rate(b, "mandarin-orange-chicken", 4, 7), rate(c, "mandarin-orange-chicken", 4, 4),
        rate(b, "chili-onion-crunch", 5, 5), rate(a, "chili-onion-crunch", 5, 9),
        rate(c, "hold-the-cone", 5, 2), rate(a, "hold-the-cone", 4, 8),
        rate(a, "cauliflower-gnocchi", 3, 10), rate(b, "cauliflower-gnocchi", 2, 11),
      );
      db.reviews.push(
        rv(a, "mandarin-orange-chicken", "Demo review: crisped it in the air fryer and only used half the sauce. Exactly what I want on a weeknight.", 6),
        rv(b, "chili-onion-crunch", "Demo review: more crunch than heat. Fried eggs are never going back.", 5),
        rv(c, "hold-the-cone", "Demo review: the perfect three-bite dessert. Dangerous to keep in the freezer.", 2),
        rv(b, "cauliflower-gnocchi", "Demo review: pan-fry it from frozen or it goes soft. Fine, not a favorite.", 11),
      );
      db.collections.push(...cols.map((x) => x.c));
      db.collectionItems.push(...cols.flatMap((x) => x.items));
    });
  }

  removeDemoCommunity() {
    this.commit((db) => {
      const demo = new Set(db.users.filter((u) => u.isDemo).map((u) => u.id));
      const demoReviews = new Set(db.reviews.filter((r) => demo.has(r.authorId)).map((r) => r.id));
      const demoCols = new Set(db.collections.filter((c) => demo.has(c.ownerId)).map((c) => c.id));
      db.users = db.users.filter((u) => !demo.has(u.id));
      db.userProducts = db.userProducts.filter((u) => !demo.has(u.userId));
      db.reviews = db.reviews.filter((r) => !demoReviews.has(r.id));
      db.reviewMedia = db.reviewMedia.filter((m) => !demoReviews.has(m.reviewId));
      db.collections = db.collections.filter((c) => !demoCols.has(c.id));
      db.collectionItems = db.collectionItems.filter((i) => !demoCols.has(i.collectionId));
      if (db.sessionUserId && demo.has(db.sessionUserId)) db.sessionUserId = null;
    });
  }
}

/** Downscale to keep localStorage usage small. Validation happens before this. */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export type { Product };
