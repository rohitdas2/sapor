"use client";

import { fromGroups, rankNumbers, toGroups } from "../ranking";
import type {
  CommunityPick,
  Comparison,
  ComparisonResult,
  OrderEntry,
  Collection,
  CollectionItem,
  CollectionWithItems,
  FeedEntry,
  Product,
  Profile,
  PublicReview,
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
} from "./store";

/**
 * LOCAL DEMO store. Persists to this browser's localStorage. It simulates the
 * production row-level-security rules in code so the UI behaves the same way,
 * but it is NOT a security boundary: anyone with the browser can read the raw data.
 */

const KEY = "sapor:local-demo:v2"; // v2: guided rankings replace numeric ratings

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
  comparisons: Comparison[];
  sessionUserId: string | null;
}

const empty = (): DB => ({
  users: [],
  userProducts: [],
  collections: [],
  collectionItems: [],
  reviews: [],
  reviewMedia: [],
  comparisons: [],
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

  /** Products people put in the top 3 of their public rankings. Only real activity counts. */
  async communityFavorites(limit: number): Promise<CommunityPick[]> {
    const owners = new Map<string, Set<string>>();
    for (const c of this.db.collections) {
      if (c.visibility !== "public") continue;
      const placed = this.placedOrder(this.db, c.id);
      const ranks = rankNumbers(placed);
      placed.forEach((e, i) => {
        if (ranks[i] > 3) return;
        owners.set(e.productId, (owners.get(e.productId) ?? new Set()).add(c.ownerId));
      });
    }
    return [...owners.entries()]
      .filter(([pid, o]) => o.size >= 2 && byProductId.has(pid))
      .map(([pid, o]) => ({ product: byProductId.get(pid)!, topThreeCount: o.size }))
      .sort((a, b) => b.topThreeCount - a.topThreeCount || a.product.name.localeCompare(b.product.name))
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
        .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.addedAt.localeCompare(b.addedAt))
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

  private placedOrder(db: DB, collectionId: string): OrderEntry[] {
    return db.collectionItems
      .filter((i) => i.collectionId === collectionId && i.position != null)
      .sort((a, b) => a.position! - b.position!)
      .map((i) => ({ productId: i.productId, tiedWithPrev: i.tiedWithPrev }));
  }

  /** Write a full placed order; anything else in the collection becomes unplaced. */
  private writeOrder(db: DB, collectionId: string, order: OrderEntry[]) {
    const items = db.collectionItems.filter((i) => i.collectionId === collectionId);
    for (const i of items) {
      i.position = null;
      i.tiedWithPrev = false;
    }
    order.forEach((e, idx) => {
      const item = items.find((i) => i.productId === e.productId)!;
      item.position = idx;
      item.tiedWithPrev = idx > 0 && e.tiedWithPrev;
    });
  }

  async addToCollection(collectionId: string, productId: string) {
    if (!byProductId.has(productId)) throw new StoreError("Unknown product.");
    let placed = false;
    this.commit((db) => {
      const c = this.ownCollection(db, collectionId);
      if (db.collectionItems.some((i) => i.collectionId === collectionId && i.productId === productId)) {
        placed = db.collectionItems.find((i) => i.collectionId === collectionId && i.productId === productId)!.position != null;
        return; // no duplicates
      }
      // The first item in an empty ranking is its starting entry; others start unplaced.
      placed = this.placedOrder(db, collectionId).length === 0;
      db.collectionItems.push({ collectionId, productId, position: placed ? 0 : null, tiedWithPrev: false, addedAt: now() });
      c.updatedAt = now();
    });
    return { placed };
  }

  async removeFromCollection(collectionId: string, productId: string) {
    this.commit((db) => {
      const c = this.ownCollection(db, collectionId);
      const groups = toGroups(this.placedOrder(db, collectionId)).map((g) => g.filter((p) => p !== productId)).filter((g) => g.length);
      db.collectionItems = db.collectionItems.filter((i) => !(i.collectionId === collectionId && i.productId === productId));
      this.writeOrder(db, collectionId, fromGroups(groups));
      c.updatedAt = now();
    });
  }

  async saveOrder(collectionId: string, order: OrderEntry[]) {
    this.commit((db) => {
      const c = this.ownCollection(db, collectionId);
      const ids = new Set(db.collectionItems.filter((i) => i.collectionId === collectionId).map((i) => i.productId));
      const seen = new Set(order.map((e) => e.productId));
      if (seen.size !== order.length || !order.every((e) => ids.has(e.productId))) {
        throw new StoreError("That order doesn't match the collection. Refresh and try again.");
      }
      this.writeOrder(db, collectionId, order);
      c.updatedAt = now();
    });
  }

  async recordComparison(input: { collectionId: string; productId: string; otherProductId: string; result: ComparisonResult }) {
    const me = this.requireUser();
    this.commit((db) => {
      this.ownCollection(db, input.collectionId);
      db.comparisons.push({ id: uid(), userId: me, ...input, createdAt: now() });
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
    return { ...this.withMedia(r), author: this.profileOf(r.authorId)! };
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
      if (!hydrated.items.some((i) => i.position != null)) continue;
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
    const tried = (u: LocalUser, slug: string, ago: number): UserProduct => ({
      userId: u.id, productId: `p-${slug}`, status: "tried",
      notes: "Demo note — private, never shown to others.", firstTriedOn: t(ago).slice(0, 10), createdAt: t(ago), updatedAt: t(ago),
    });
    const rv = (u: LocalUser, slug: string, body: string, ago: number) => ({
      id: uid(), authorId: u.id, productId: `p-${slug}`, body, visibility: "public" as const, createdAt: t(ago), updatedAt: t(ago),
    });
    const col = (u: LocalUser, title: string, slugs: string[], ago: number) => {
      const id = uid();
      return {
        c: { id, ownerId: u.id, title, description: "Demo collection (sample data).", visibility: "public" as const, createdAt: t(ago), updatedAt: t(ago) },
        items: slugs.map((s, i) => ({ collectionId: id, productId: `p-${s}`, position: i, tiedWithPrev: false, addedAt: t(ago) })),
      };
    };
    const cols = [
      col(a, "Best frozen meals", ["mandarin-orange-chicken", "chicken-soup-dumplings", "kimbap", "cauliflower-gnocchi"], 3),
      col(b, "Sauces worth the fridge space", ["chili-onion-crunch", "zhoug-sauce", "green-goddess-dressing"], 5),
      col(c, "Desserts, ranked", ["hold-the-cone", "dark-chocolate-peanut-butter-cups", "mochi-ice-cream", "joe-joes"], 1),
    ];
    // A second public ranking so community favorites reflect more than one person.
    cols.push(col(b, "Weeknight freezer staples", ["chicken-soup-dumplings", "mandarin-orange-chicken", "japanese-fried-rice"], 4));
    const users = new Map([a, b, c].map((u) => [u.id, u]));
    a.pinnedCollectionId = cols[0].c.id;
    c.pinnedCollectionId = cols[2].c.id;
    this.commit((db) => {
      db.users.push(a, b, c);
      db.userProducts.push(
        ...cols.flatMap((x) => x.items.map((i) => tried(users.get(x.c.ownerId)!, i.productId.slice(2), 5))),
        tried(b, "cauliflower-gnocchi", 11),
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
      db.comparisons = db.comparisons.filter((x) => !demo.has(x.userId));
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
