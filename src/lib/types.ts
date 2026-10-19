// Domain types. Catalog, personal tracking, rankings and public content are
// deliberately separate shapes, mirroring the tables in supabase/migrations.

export const CATEGORIES = [
  { id: "frozen-meals", label: "Frozen meals" },
  { id: "snacks", label: "Snacks" },
  { id: "desserts", label: "Desserts" },
  { id: "sauces", label: "Sauces & dips" },
  { id: "bakery", label: "Bakery" },
  { id: "drinks", label: "Drinks" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type Availability = "unknown" | "active" | "seasonal" | "discontinued";
export type Visibility = "private" | "public";
export type TrackStatus = "want_to_try" | "tried";

export interface Retailer {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  retailerId: string;
  name: string;
  slug: string;
  category: CategoryId;
  description: string;
  imageUrl: string | null;
  imageIsPlaceholder: boolean;
  /** Illustration shown when there's no permitted product photo. */
  emoji: string | null;
  /** Freely licensed representative photo (not the actual product), with attribution. */
  photo: { url: string; credit: string; license: string; source: string } | null;
  /** Optional official Instagram post to embed (shown via Instagram's embed, never copied). */
  instagramUrl: string | null;
  availability: Availability;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  pinnedCollectionId: string | null;
  isDemo: boolean;
  createdAt: string;
}

/** Private to its owner. No numeric ratings: opinions live in collection placements. */
export interface UserProduct {
  userId: string;
  productId: string;
  status: TrackStatus;
  notes: string | null;
  firstTriedOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  collectionId: string;
  productId: string;
  /** Order among placed items; null = added but not yet placed ("return later"). */
  position: number | null;
  /** Shares a rank with the item directly above it. */
  tiedWithPrev: boolean;
  addedAt: string;
}

export type ComparisonResult = "prefer_this" | "prefer_that" | "same" | "unsure";

/** One answer from guided placement. "this" = the product being placed. */
export interface Comparison {
  id: string;
  userId: string;
  collectionId: string;
  productId: string;
  otherProductId: string;
  result: ComparisonResult;
  createdAt: string;
}

/** A placed entry as saved by the user (the confirmed order is the source of truth). */
export interface OrderEntry {
  productId: string;
  tiedWithPrev: boolean;
}

export interface ReviewMedia {
  id: string;
  reviewId: string;
  url: string;
  mediaType: "image"; // "video" reserved for later
  displayOrder: number;
}

export interface Review {
  id: string;
  authorId: string;
  productId: string;
  body: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  media: ReviewMedia[];
}

/** A review as other people see it. */
export interface PublicReview extends Review {
  author: Profile;
}

export interface CollectionWithItems extends Collection {
  owner: Profile;
  items: (CollectionItem & { product: Product })[];
}

export interface CommunityPick {
  product: Product;
  /** Distinct people who placed it in the top 3 of a public ranking. */
  topThreeCount: number;
}

export type FeedEntry =
  | { kind: "review"; at: string; review: PublicReview; product: Product }
  | { kind: "collection"; at: string; collection: CollectionWithItems };

export interface ProductFilter {
  q?: string;
  category?: CategoryId | null;
}
