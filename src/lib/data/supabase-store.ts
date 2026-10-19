"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Collection,
  CollectionWithItems,
  FeedEntry,
  Product,
  ProductFilter,
  Profile,
  PublicReview,
  CommunityPick,
  ComparisonResult,
  OrderEntry,
  Review,
  TrackStatus,
  UserProduct,
  Visibility,
} from "../types";
import {
  MAX_PHOTOS_PER_REVIEW,
  type ReviewInput,
  type SaporStore,
  StoreError,
  type UserProductPatch,
  validatePhoto,
} from "./store";

/**
 * Production store backed by Supabase. Access control is enforced by the
 * row-level-security policies in supabase/migrations; this class only adds
 * input validation and maps rows to domain types.
 */

const RETAILER_ID = "trader-joes";

// ---------- row shapes ----------
interface ProductRow {
  id: string;
  retailer_id: string;
  name: string;
  slug: string;
  category: Product["category"];
  description: string;
  image_path: string | null;
  emoji: string | null;
  availability: Product["availability"];
  source_url: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}
interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  pinned_collection_id: string | null;
  is_demo: boolean;
  created_at: string;
}
interface UserProductRow {
  user_id: string;
  product_id: string;
  status: TrackStatus;
  notes: string | null;
  first_tried_on: string | null;
  created_at: string;
  updated_at: string;
}
interface CollectionRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}
interface CollectionJoinedRow extends CollectionRow {
  owner: ProfileRow;
  collection_items: { product_id: string; position: number | null; tied_with_prev: boolean; added_at: string; product: ProductRow }[];
}
interface MediaRow {
  id: string;
  review_id: string;
  storage_path: string;
  media_type: "image" | "video";
  display_order: number;
}
interface ReviewRow {
  id: string;
  author_id: string;
  product_id: string;
  body: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  review_media: MediaRow[];
}
interface ReviewJoinedRow extends ReviewRow {
  author: ProfileRow;
  product?: ProductRow;
}

// Disambiguate: profiles <-> collections has two FKs (owner_id, pinned_collection_id).
const COLLECTION_SELECT =
  "*, owner:profiles!collections_owner_id_fkey(*), collection_items(product_id, position, tied_with_prev, added_at, product:products(*))";
const REVIEW_SELECT = "*, review_media(*), author:profiles(*)";

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new StoreError(error.message);
}

/** Strip characters that have meaning in PostgREST filter strings. */
function safeSearch(q: string) {
  return q.replace(/[,()%*\\]/g, " ").trim();
}

export class SupabaseStore implements SaporStore {
  mode = "supabase" as const;
  private sb: SupabaseClient;
  private userId: string | null = null;
  private listeners = new Set<() => void>();

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey);
    this.sb.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next !== this.userId) {
        this.userId = next;
        this.emit();
      }
    });
  }

  /** Resolve the persisted session before the UI renders, so auth gates don't flash. */
  async init() {
    const { data } = await this.sb.auth.getSession();
    this.userId = data.session?.user.id ?? null;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private requireUser() {
    if (!this.userId) throw new StoreError("Sign in to do that.");
    return this.userId;
  }

  // ---------- mapping ----------
  private product(r: ProductRow): Product {
    return {
      id: r.id,
      retailerId: r.retailer_id,
      name: r.name,
      slug: r.slug,
      category: r.category,
      description: r.description,
      imageUrl: r.image_path ? this.sb.storage.from("product-images").getPublicUrl(r.image_path).data.publicUrl : null,
      imageIsPlaceholder: !r.image_path,
      emoji: r.emoji,
      photo: null, // TODO: add photo columns to products when moving off the local catalog
      availability: r.availability,
      sourceUrl: r.source_url,
      lastVerifiedAt: r.last_verified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private profile(r: ProfileRow): Profile {
    return {
      id: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
      pinnedCollectionId: r.pinned_collection_id,
      isDemo: r.is_demo,
      createdAt: r.created_at,
    };
  }

  private userProduct(r: UserProductRow): UserProduct {
    return {
      userId: r.user_id,
      productId: r.product_id,
      status: r.status,
      notes: r.notes,
      firstTriedOn: r.first_tried_on,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private collectionBase(r: CollectionRow): Collection {
    return {
      id: r.id,
      ownerId: r.owner_id,
      title: r.title,
      description: r.description,
      visibility: r.visibility,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private collection(r: CollectionJoinedRow): CollectionWithItems {
    return {
      ...this.collectionBase(r),
      owner: this.profile(r.owner),
      items: [...r.collection_items]
        .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.added_at.localeCompare(b.added_at))
        .map((i) => ({
          collectionId: r.id,
          productId: i.product_id,
          position: i.position,
          tiedWithPrev: i.tied_with_prev,
          addedAt: i.added_at,
          product: this.product(i.product),
        })),
    };
  }

  private review(r: ReviewRow): Review {
    return {
      id: r.id,
      authorId: r.author_id,
      productId: r.product_id,
      body: r.body,
      visibility: r.visibility,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      media: [...(r.review_media ?? [])]
        .sort((a, b) => a.display_order - b.display_order)
        .map((m) => ({
          id: m.id,
          reviewId: m.review_id,
          url: this.sb.storage.from("review-media").getPublicUrl(m.storage_path).data.publicUrl,
          mediaType: "image" as const,
          displayOrder: m.display_order,
        })),
    };
  }

  private publicReviews(rows: ReviewJoinedRow[]): PublicReview[] {
    return rows.map((r) => ({ ...this.review(r), author: this.profile(r.author) }));
  }

  // ---------- auth ----------
  currentUserId() {
    return this.userId;
  }

  async signUp({ email, password, displayName }: { email: string; password: string; displayName: string }) {
    const name = displayName.trim();
    if (!name) throw new StoreError("Pick a display name.");
    if (password.length < 8) throw new StoreError("Use at least 8 characters for your password.");
    const { data, error } = await this.sb.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.slice(0, 40) } },
    });
    fail(error);
    if (!data.session) throw new StoreError("Check your email to confirm your account, then sign in.");
  }

  async signIn({ email, password }: { email: string; password: string }) {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    fail(error);
  }

  async signOut() {
    const { error } = await this.sb.auth.signOut();
    fail(error);
  }

  // ---------- catalog ----------
  async listProducts(filter: ProductFilter = {}) {
    let query = this.sb.from("products").select("*").eq("retailer_id", RETAILER_ID).order("name");
    if (filter.category) query = query.eq("category", filter.category);
    const q = filter.q ? safeSearch(filter.q) : "";
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    const { data, error } = await query;
    fail(error);
    return (data as ProductRow[]).map((r) => this.product(r));
  }

  async getProductBySlug(slug: string) {
    const { data, error } = await this.sb.from("products").select("*").eq("retailer_id", RETAILER_ID).eq("slug", slug).maybeSingle();
    fail(error);
    return data ? this.product(data as ProductRow) : null;
  }

  async newAdditions(limit: number) {
    const { data, error } = await this.sb
      .from("products")
      .select("*")
      .eq("retailer_id", RETAILER_ID)
      .order("created_at", { ascending: false })
      .limit(limit);
    fail(error);
    return (data as ProductRow[]).map((r) => this.product(r));
  }

  async communityFavorites(limit: number): Promise<CommunityPick[]> {
    const { data: picks, error } = await this.sb
      .from("community_top_picks")
      .select("*")
      .gte("top_three_count", 2)
      .order("top_three_count", { ascending: false })
      .limit(limit);
    fail(error);
    if (!picks?.length) return [];
    const { data: products, error: pErr } = await this.sb
      .from("products")
      .select("*")
      .in("id", picks.map((p) => p.product_id));
    fail(pErr);
    const byId = new Map((products as ProductRow[]).map((p) => [p.id, this.product(p)]));
    return picks.filter((p) => byId.has(p.product_id)).map((p) => ({ product: byId.get(p.product_id)!, topThreeCount: p.top_three_count }));
  }

  // ---------- tracking ----------
  async myUserProducts() {
    if (!this.userId) return [];
    const { data, error } = await this.sb.from("user_products").select("*").eq("user_id", this.userId);
    fail(error);
    return (data as UserProductRow[]).map((r) => this.userProduct(r));
  }

  async myUserProduct(productId: string) {
    if (!this.userId) return null;
    const { data, error } = await this.sb
      .from("user_products")
      .select("*")
      .eq("user_id", this.userId)
      .eq("product_id", productId)
      .maybeSingle();
    fail(error);
    return data ? this.userProduct(data as UserProductRow) : null;
  }

  async setStatus(productId: string, status: TrackStatus) {
    return this.updateUserProduct(productId, { status });
  }

  async updateUserProduct(productId: string, patch: UserProductPatch) {
    const me = this.requireUser();
    const existing = await this.myUserProduct(productId);
    const status = patch.status ?? existing?.status ?? "want_to_try";
    const today = new Date().toISOString().slice(0, 10);
    const row = {
      user_id: me,
      product_id: productId,
      status,
      notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
      first_tried_on:
        patch.firstTriedOn !== undefined ? patch.firstTriedOn : (existing?.firstTriedOn ?? (status === "tried" ? today : null)),
    };
    const { data, error } = await this.sb.from("user_products").upsert(row, { onConflict: "user_id,product_id" }).select().single();
    fail(error);
    this.emit();
    return this.userProduct(data as UserProductRow);
  }

  async untrack(productId: string) {
    const me = this.requireUser();
    const { error } = await this.sb.from("user_products").delete().eq("user_id", me).eq("product_id", productId);
    fail(error);
    this.emit();
  }

  // ---------- collections ----------
  async myCollections() {
    if (!this.userId) return [];
    const { data, error } = await this.sb
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("owner_id", this.userId)
      .order("updated_at", { ascending: false });
    fail(error);
    return (data as unknown as CollectionJoinedRow[]).map((r) => this.collection(r));
  }

  async getCollection(id: string) {
    // RLS returns nothing for someone else's private collection.
    const { data, error } = await this.sb.from("collections").select(COLLECTION_SELECT).eq("id", id).maybeSingle();
    if (error?.code === "22P02") return null; // not a uuid
    fail(error);
    return data ? this.collection(data as unknown as CollectionJoinedRow) : null;
  }

  async createCollection(input: { title: string; description?: string; visibility: Visibility }) {
    const me = this.requireUser();
    const title = input.title.trim();
    if (!title) throw new StoreError("Give your collection a name.");
    const { data, error } = await this.sb
      .from("collections")
      .insert({
        owner_id: me,
        title: title.slice(0, 80),
        description: input.description?.trim().slice(0, 280) || null,
        visibility: input.visibility,
      })
      .select()
      .single();
    fail(error);
    this.emit();
    return this.collectionBase(data as CollectionRow);
  }

  async updateCollection(id: string, patch: Partial<Pick<Collection, "title" | "description" | "visibility">>) {
    this.requireUser();
    if (patch.title !== undefined && !patch.title.trim()) throw new StoreError("Give your collection a name.");
    const { data, error } = await this.sb.from("collections").update(patch).eq("id", id).select("id");
    fail(error);
    if (!data?.length) throw new StoreError("You can only change your own collections.");
    this.emit();
  }

  async deleteCollection(id: string) {
    this.requireUser();
    const { data, error } = await this.sb.from("collections").delete().eq("id", id).select("id");
    fail(error);
    if (!data?.length) throw new StoreError("You can only delete your own collections.");
    this.emit();
  }

  async addToCollection(collectionId: string, productId: string) {
    this.requireUser();
    const { data, error } = await this.sb.rpc("add_to_collection", { p_collection_id: collectionId, p_product_id: productId });
    fail(error);
    this.emit();
    return { placed: data === true };
  }

  async removeFromCollection(collectionId: string, productId: string) {
    this.requireUser();
    const { error } = await this.sb.rpc("remove_from_collection", { p_collection_id: collectionId, p_product_id: productId });
    fail(error);
    this.emit();
  }

  async saveOrder(collectionId: string, order: OrderEntry[]) {
    this.requireUser();
    const { error } = await this.sb.rpc("save_collection_order", {
      p_collection_id: collectionId,
      p_order: order.map((e) => ({ product_id: e.productId, tied_with_prev: e.tiedWithPrev })),
    });
    if (error) throw new StoreError("Couldn't save that order. Refresh and try again.");
    this.emit();
  }

  async recordComparison(input: { collectionId: string; productId: string; otherProductId: string; result: ComparisonResult }) {
    const me = this.requireUser();
    const { error } = await this.sb.from("comparisons").insert({
      user_id: me,
      collection_id: input.collectionId,
      product_id: input.productId,
      other_product_id: input.otherProductId,
      result: input.result,
    });
    fail(error);
  }

  async publicCollectionsForProduct(productId: string) {
    const { data: items, error } = await this.sb.from("collection_items").select("collection_id").eq("product_id", productId);
    fail(error);
    if (!items?.length) return [];
    const { data, error: cErr } = await this.sb
      .from("collections")
      .select(COLLECTION_SELECT)
      .in("id", items.map((i) => i.collection_id))
      .eq("visibility", "public")
      .order("updated_at", { ascending: false });
    fail(cErr);
    return (data as unknown as CollectionJoinedRow[]).map((r) => this.collection(r));
  }

  async publicCollectionsByUser(userId: string) {
    const { data, error } = await this.sb
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("owner_id", userId)
      .eq("visibility", "public")
      .order("updated_at", { ascending: false });
    fail(error);
    return (data as unknown as CollectionJoinedRow[]).map((r) => this.collection(r));
  }

  // ---------- reviews ----------
  async myReview(productId: string) {
    if (!this.userId) return null;
    const { data, error } = await this.sb
      .from("reviews")
      .select("*, review_media(*)")
      .eq("author_id", this.userId)
      .eq("product_id", productId)
      .maybeSingle();
    fail(error);
    return data ? this.review(data as ReviewRow) : null;
  }

  async saveReview(productId: string, input: ReviewInput) {
    const me = this.requireUser();
    const body = input.body.trim();
    const photos = input.newPhotos ?? [];
    if (!body && !photos.length) throw new StoreError("Write something or add a photo.");
    if (body.length > 2000) throw new StoreError("Reviews are limited to 2,000 characters.");
    photos.forEach(validatePhoto);

    const existing = await this.myReview(productId);
    const kept = (existing?.media ?? []).filter((m) => !input.removeMediaIds?.includes(m.id));
    if (kept.length + photos.length > MAX_PHOTOS_PER_REVIEW) throw new StoreError(`Up to ${MAX_PHOTOS_PER_REVIEW} photos per review.`);

    const { data: saved, error } = await this.sb
      .from("reviews")
      .upsert({ author_id: me, product_id: productId, body, visibility: input.visibility }, { onConflict: "author_id,product_id" })
      .select("id")
      .single();
    fail(error);
    const reviewId = saved.id as string;

    if (input.removeMediaIds?.length) {
      const { data: removed, error: delErr } = await this.sb
        .from("review_media")
        .delete()
        .eq("review_id", reviewId)
        .in("id", input.removeMediaIds)
        .select("storage_path");
      fail(delErr);
      if (removed?.length) await this.sb.storage.from("review-media").remove(removed.map((r) => r.storage_path));
    }

    // Upload into the user's own folder; storage policies reject anything else.
    const uploaded: string[] = [];
    try {
      for (const file of photos) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${me}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await this.sb.storage.from("review-media").upload(path, file, { contentType: file.type });
        fail(upErr);
        uploaded.push(path);
      }
      if (uploaded.length) {
        const { error: mErr } = await this.sb.from("review_media").insert(
          uploaded.map((storage_path, i) => ({ review_id: reviewId, storage_path, media_type: "image", display_order: kept.length + i })),
        );
        fail(mErr);
      }
    } catch (e) {
      if (uploaded.length) await this.sb.storage.from("review-media").remove(uploaded);
      throw e instanceof StoreError ? e : new StoreError("Photo upload failed. Try again.");
    }

    this.emit();
    return (await this.myReview(productId))!;
  }

  async deleteReview(productId: string) {
    const existing = await this.myReview(productId);
    if (!existing) return;
    const { data: media } = await this.sb.from("review_media").select("storage_path").eq("review_id", existing.id);
    const { error } = await this.sb.from("reviews").delete().eq("id", existing.id);
    fail(error);
    if (media?.length) await this.sb.storage.from("review-media").remove(media.map((m) => m.storage_path));
    this.emit();
  }

  async publicReviewsForProduct(productId: string) {
    const { data, error } = await this.sb
      .from("reviews")
      .select(REVIEW_SELECT)
      .eq("product_id", productId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false });
    fail(error);
    return this.publicReviews(data as unknown as ReviewJoinedRow[]);
  }

  // ---------- profiles + feed ----------
  async getProfile(userId: string) {
    const { data, error } = await this.sb
      .from("profiles")
      .select("id, display_name, avatar_url, bio, pinned_collection_id, is_demo, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error?.code === "22P02") return null;
    fail(error);
    return data ? this.profile(data as ProfileRow) : null;
  }

  async updateMyProfile(patch: Partial<Pick<Profile, "displayName" | "bio" | "avatarUrl" | "pinnedCollectionId">>) {
    const me = this.requireUser();
    if (patch.displayName !== undefined && !patch.displayName.trim()) throw new StoreError("Display name can't be empty.");
    const row: Record<string, unknown> = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName.trim().slice(0, 40);
    if (patch.bio !== undefined) row.bio = patch.bio?.trim().slice(0, 160) || null;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.pinnedCollectionId !== undefined) row.pinned_collection_id = patch.pinnedCollectionId;
    const { error } = await this.sb.from("profiles").update(row).eq("id", me);
    fail(error);
    this.emit();
  }

  async feed({ userId, limit = 40 }: { userId?: string; limit?: number } = {}) {
    let rq = this.sb
      .from("reviews")
      .select(`${REVIEW_SELECT}, product:products(*)`)
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(limit);
    let cq = this.sb
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (userId) {
      rq = rq.eq("author_id", userId);
      cq = cq.eq("owner_id", userId);
    }
    const [reviews, collections] = await Promise.all([rq, cq]);
    fail(reviews.error);
    fail(collections.error);

    const reviewRows = reviews.data as unknown as ReviewJoinedRow[];
    const publicReviews = this.publicReviews(reviewRows);
    const entries: FeedEntry[] = publicReviews.map((r, i) => ({
      kind: "review",
      at: r.updatedAt,
      review: r,
      product: this.product(reviewRows[i].product!),
    }));
    for (const row of collections.data as unknown as CollectionJoinedRow[]) {
      const c = this.collection(row);
      if (c.items.some((i) => i.position != null)) entries.push({ kind: "collection", at: c.updatedAt, collection: c });
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
}
