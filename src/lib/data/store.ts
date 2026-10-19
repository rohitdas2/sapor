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

export type StoreMode = "local-demo" | "supabase";

export interface UserProductPatch {
  status?: TrackStatus;
  notes?: string | null;
  firstTriedOn?: string | null;
}

export interface ReviewInput {
  body: string;
  visibility: Visibility;
  /** New photos to attach (validated before upload). */
  newPhotos?: File[];
  /** Existing media ids to remove. */
  removeMediaIds?: string[];
}

/**
 * Everything the UI can do. Implementations must enforce the same privacy
 * rules: other people's tracking rows, notes and private content are never
 * returned, and writes only touch the current user's records.
 */
export interface SaporStore {
  mode: StoreMode;
  /** Optional async setup (e.g. restoring an auth session) before first render. */
  init?(): Promise<void>;
  subscribe(listener: () => void): () => void;

  // auth
  currentUserId(): string | null;
  signUp(input: { email: string; password: string; displayName: string }): Promise<void>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;

  // catalog (read-only for users)
  listProducts(filter?: ProductFilter): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  newAdditions(limit: number): Promise<Product[]>;
  communityFavorites(limit: number): Promise<CommunityPick[]>;

  // personal tracking (private)
  myUserProducts(): Promise<UserProduct[]>;
  myUserProduct(productId: string): Promise<UserProduct | null>;
  setStatus(productId: string, status: TrackStatus): Promise<UserProduct>;
  updateUserProduct(productId: string, patch: UserProductPatch): Promise<UserProduct>;
  untrack(productId: string): Promise<void>;

  // collections
  myCollections(): Promise<CollectionWithItems[]>;
  getCollection(id: string): Promise<CollectionWithItems | null>;
  createCollection(input: { title: string; description?: string; visibility: Visibility }): Promise<Collection>;
  updateCollection(id: string, patch: Partial<Pick<Collection, "title" | "description" | "visibility">>): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  /**
   * Adds a product unplaced. If the collection has no placed items yet it
   * becomes the starting entry at #1. Returns whether it was placed.
   */
  addToCollection(collectionId: string, productId: string): Promise<{ placed: boolean }>;
  removeFromCollection(collectionId: string, productId: string): Promise<void>;
  /**
   * Save the full confirmed order of placed items (with ties) in one atomic
   * write. Items in the collection but not in `order` become unplaced.
   */
  saveOrder(collectionId: string, order: OrderEntry[]): Promise<void>;
  recordComparison(input: { collectionId: string; productId: string; otherProductId: string; result: ComparisonResult }): Promise<void>;
  publicCollectionsForProduct(productId: string): Promise<CollectionWithItems[]>;

  // reviews
  myReview(productId: string): Promise<Review | null>;
  saveReview(productId: string, input: ReviewInput): Promise<Review>;
  deleteReview(productId: string): Promise<void>;
  publicReviewsForProduct(productId: string): Promise<PublicReview[]>;

  // profiles + community
  getProfile(userId: string): Promise<Profile | null>;
  updateMyProfile(patch: Partial<Pick<Profile, "displayName" | "bio" | "avatarUrl" | "pinnedCollectionId">>): Promise<void>;
  publicCollectionsByUser(userId: string): Promise<CollectionWithItems[]>;
  feed(opts?: { userId?: string; limit?: number }): Promise<FeedEntry[]>;
}

export class StoreError extends Error {}

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_REVIEW = 4;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validatePhoto(file: File) {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    throw new StoreError("Photos must be JPEG, PNG or WebP.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new StoreError("Each photo must be under 8 MB.");
  }
}
