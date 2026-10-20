import type {
  Collection,
  CollectionWithItems,
  Comment,
  CommunityPick,
  ComparisonResult,
  FeedEntry,
  OrderEntry,
  Product,
  ProductFilter,
  Profile,
  PublicReview,
  Review,
  ScoreStats,
  Tier,
  TopRated,
  TrackStatus,
  UserProduct,
  Visibility,
} from "../types";

export interface UserProductPatch {
  status?: TrackStatus;
  notes?: string | null;
}

export interface ReviewInput {
  body: string;
  visibility: Visibility;
  /** New photos to attach (validated before upload). */
  newPhotos?: File[];
  /** Existing media ids to remove. */
  removeMediaIds?: string[];
}

export interface Me {
  id: string;
  role: "user" | "admin";
  profile: Profile;
}

/**
 * Everything the UI can do, backed by the Sapor API (src/app/api). Anonymous
 * visitors can call the read methods; writes require a signed-in user and the
 * server enforces that and all privacy rules.
 */
export interface SaporStore {
  init(): Promise<void>;
  subscribe(listener: () => void): () => void;

  // auth
  me(): Me | null;
  currentUserId(): string | null;
  signUp(input: { email: string; password: string; displayName: string }): Promise<void>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;

  // catalog + discovery (public)
  listProducts(filter?: ProductFilter): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  scoreStats(slug: string): Promise<ScoreStats>;
  discover(): Promise<{ newAdditions: Product[]; favorites: CommunityPick[]; topRated: TopRated[] }>;

  // personal tracking (private)
  myUserProducts(): Promise<UserProduct[]>;
  myUserProduct(productId: string): Promise<UserProduct | null>;
  setStatus(productId: string, status: TrackStatus): Promise<UserProduct>;
  updateUserProduct(productId: string, patch: UserProductPatch): Promise<UserProduct>;
  untrack(productId: string): Promise<void>;

  // scores: overall taste ranking per tier
  myTier(tier: Tier): Promise<(OrderEntry & { product: Product })[]>;
  saveTierOrder(tier: Tier, order: OrderEntry[]): Promise<void>;
  clearScore(productId: string): Promise<void>;
  recordComparison(input: { collectionId?: string | null; productId: string; otherProductId: string; result: ComparisonResult }): Promise<void>;

  // collections
  myCollections(): Promise<CollectionWithItems[]>;
  getCollection(id: string): Promise<CollectionWithItems | null>;
  createCollection(input: { title: string; description?: string; visibility: Visibility }): Promise<Collection>;
  updateCollection(id: string, patch: Partial<Pick<Collection, "title" | "description" | "visibility">>): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  /** Adds unplaced; the first item in an empty ranking becomes #1. */
  addToCollection(collectionId: string, productId: string): Promise<{ placed: boolean }>;
  removeFromCollection(collectionId: string, productId: string): Promise<void>;
  /** Save the full confirmed order (with ties) atomically; unlisted items become unplaced. */
  saveOrder(collectionId: string, order: OrderEntry[]): Promise<void>;
  publicCollectionsForProduct(slug: string): Promise<CollectionWithItems[]>;

  // reviews
  myReview(productId: string): Promise<Review | null>;
  saveReview(productId: string, input: ReviewInput): Promise<Review>;
  deleteReview(productId: string): Promise<void>;
  publicReviewsForProduct(slug: string): Promise<PublicReview[]>;

  // comments
  productComments(slug: string): Promise<Comment[]>;
  addComment(slug: string, body: string, parentId?: string | null): Promise<Comment>;
  deleteComment(id: string): Promise<void>;

  // profiles + community
  getProfile(userId: string): Promise<Profile | null>;
  updateMyProfile(patch: Partial<Pick<Profile, "displayName" | "bio" | "pinnedCollectionId" | "shareScores">>): Promise<void>;
  publicCollectionsByUser(userId: string): Promise<CollectionWithItems[]>;
  feed(opts?: { userId?: string; limit?: number }): Promise<FeedEntry[]>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

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
