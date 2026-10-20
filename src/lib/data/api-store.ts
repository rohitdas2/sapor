"use client";

import type { Product, Tier } from "../types";
import { type Me, type SaporStore, StoreError, validatePhoto } from "./store";

/** Browser client for the Sapor API. Session lives in an httpOnly cookie. */
export class ApiStore implements SaporStore {
  private user: Me | null = null;
  private listeners = new Set<() => void>();

  async init() {
    const { user } = await this.get<{ user: Me | null }>("/api/auth/me");
    this.user = user;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const isForm = body instanceof FormData;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
    } catch {
      throw new StoreError("Can't reach Sapor. Check your connection.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && this.user) {
        this.user = null; // session expired
        this.emit();
      }
      throw new StoreError(data?.error ?? "Something went wrong.", res.status);
    }
    return data as T;
  }

  private get = <T>(url: string) => this.request<T>("GET", url);
  private async write<T>(method: string, url: string, body?: unknown) {
    const out = await this.request<T>(method, url, body);
    this.emit(); // queries re-run after any change
    return out;
  }

  // ---------- auth
  me() {
    return this.user;
  }
  currentUserId() {
    return this.user?.id ?? null;
  }
  async signUp(input: { email: string; password: string; displayName: string }) {
    await this.request("POST", "/api/auth/signup", input);
    await this.init();
    this.emit();
  }
  async signIn(input: { email: string; password: string }) {
    await this.request("POST", "/api/auth/login", input);
    await this.init();
    this.emit();
  }
  async signOut() {
    await this.request("POST", "/api/auth/logout");
    this.user = null;
    this.emit();
  }

  // ---------- catalog
  listProducts(filter: { q?: string; category?: string | null } = {}) {
    const p = new URLSearchParams();
    if (filter.q) p.set("q", filter.q);
    if (filter.category) p.set("category", filter.category);
    return this.get<Product[]>(`/api/products?${p}`);
  }
  async getProductBySlug(slug: string) {
    try {
      return (await this.get<{ product: Product }>(`/api/products/${encodeURIComponent(slug)}`)).product;
    } catch (e) {
      if (e instanceof StoreError && e.status === 404) return null;
      throw e;
    }
  }
  async scoreStats(slug: string) {
    return (await this.get<{ stats: Awaited<ReturnType<SaporStore["scoreStats"]>> }>(`/api/products/${encodeURIComponent(slug)}`)).stats;
  }
  discover() {
    return this.get<Awaited<ReturnType<SaporStore["discover"]>>>("/api/discover");
  }

  // ---------- tracking
  myUserProducts() {
    return this.user ? this.get<Awaited<ReturnType<SaporStore["myUserProducts"]>>>("/api/me/products") : Promise.resolve([]);
  }
  myUserProduct(productId: string) {
    return this.user ? this.get<Awaited<ReturnType<SaporStore["myUserProduct"]>>>(`/api/me/products/${productId}`) : Promise.resolve(null);
  }
  setStatus(productId: string, status: "want_to_try" | "tried") {
    return this.updateUserProduct(productId, { status });
  }
  updateUserProduct(productId: string, patch: { status?: string; notes?: string | null }) {
    return this.write<Awaited<ReturnType<SaporStore["updateUserProduct"]>>>("PUT", `/api/me/products/${productId}`, patch);
  }
  async untrack(productId: string) {
    await this.write("DELETE", `/api/me/products/${productId}`);
  }

  // ---------- scores
  myTier(tier: Tier) {
    return this.get<Awaited<ReturnType<SaporStore["myTier"]>>>(`/api/me/tiers/${tier}`);
  }
  async saveTierOrder(tier: Tier, order: { productId: string; tiedWithPrev: boolean }[]) {
    await this.write("PUT", `/api/me/tiers/${tier}`, { order });
  }
  async clearScore(productId: string) {
    await this.write("DELETE", `/api/me/products/${productId}/score`);
  }
  async recordComparison(input: Parameters<SaporStore["recordComparison"]>[0]) {
    await this.request("POST", "/api/me/comparisons", input); // no refresh needed
  }

  // ---------- collections
  myCollections() {
    return this.user ? this.get<Awaited<ReturnType<SaporStore["myCollections"]>>>("/api/collections") : Promise.resolve([]);
  }
  getCollection(id: string) {
    return this.get<Awaited<ReturnType<SaporStore["getCollection"]>>>(`/api/collections/${encodeURIComponent(id)}`);
  }
  createCollection(input: { title: string; description?: string; visibility: "private" | "public" }) {
    return this.write<Awaited<ReturnType<SaporStore["createCollection"]>>>("POST", "/api/collections", input);
  }
  async updateCollection(id: string, patch: Record<string, unknown>) {
    await this.write("PATCH", `/api/collections/${id}`, patch);
  }
  async deleteCollection(id: string) {
    await this.write("DELETE", `/api/collections/${id}`);
  }
  addToCollection(collectionId: string, productId: string) {
    return this.write<{ placed: boolean }>("POST", `/api/collections/${collectionId}/items`, { productId });
  }
  async removeFromCollection(collectionId: string, productId: string) {
    await this.write("DELETE", `/api/collections/${collectionId}/items/${productId}`);
  }
  async saveOrder(collectionId: string, order: { productId: string; tiedWithPrev: boolean }[]) {
    await this.write("PUT", `/api/collections/${collectionId}/order`, { order });
  }
  publicCollectionsForProduct(slug: string) {
    return this.get<Awaited<ReturnType<SaporStore["publicCollectionsForProduct"]>>>(`/api/products/${encodeURIComponent(slug)}/collections`);
  }

  // ---------- reviews
  myReview(productId: string) {
    return this.user ? this.get<Awaited<ReturnType<SaporStore["myReview"]>>>(`/api/me/reviews/${productId}`) : Promise.resolve(null);
  }
  saveReview(productId: string, input: Parameters<SaporStore["saveReview"]>[1]) {
    input.newPhotos?.forEach(validatePhoto);
    const form = new FormData();
    form.set("body", input.body);
    form.set("visibility", input.visibility);
    form.set("removeMediaIds", JSON.stringify(input.removeMediaIds ?? []));
    input.newPhotos?.forEach((f) => form.append("photos", f));
    return this.write<Awaited<ReturnType<SaporStore["saveReview"]>>>("PUT", `/api/me/reviews/${productId}`, form);
  }
  async deleteReview(productId: string) {
    await this.write("DELETE", `/api/me/reviews/${productId}`);
  }
  publicReviewsForProduct(slug: string) {
    return this.get<Awaited<ReturnType<SaporStore["publicReviewsForProduct"]>>>(`/api/products/${encodeURIComponent(slug)}/reviews`);
  }

  // ---------- comments
  productComments(slug: string) {
    return this.get<Awaited<ReturnType<SaporStore["productComments"]>>>(`/api/products/${encodeURIComponent(slug)}/comments`);
  }
  addComment(slug: string, body: string, parentId?: string | null) {
    return this.write<Awaited<ReturnType<SaporStore["addComment"]>>>("POST", `/api/products/${encodeURIComponent(slug)}/comments`, { body, parentId });
  }
  async deleteComment(id: string) {
    await this.write("DELETE", `/api/comments/${id}`);
  }

  // ---------- profiles + feed
  getProfile(userId: string) {
    return this.get<Awaited<ReturnType<SaporStore["getProfile"]>>>(`/api/users/${encodeURIComponent(userId)}`);
  }
  async updateMyProfile(patch: Record<string, unknown>) {
    await this.write("PATCH", "/api/me/profile", patch);
    await this.init(); // refresh cached profile
  }
  publicCollectionsByUser(userId: string) {
    return this.get<Awaited<ReturnType<SaporStore["publicCollectionsByUser"]>>>(`/api/users/${encodeURIComponent(userId)}/collections`);
  }
  feed({ userId, limit = 40 }: { userId?: string; limit?: number } = {}) {
    const p = new URLSearchParams({ limit: String(limit) });
    if (userId) p.set("userId", userId);
    return this.get<Awaited<ReturnType<SaporStore["feed"]>>>(`/api/feed?${p}`);
  }
}
