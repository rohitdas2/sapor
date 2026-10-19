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

/** Private to its owner. Rating lives here and only here. */
export interface UserProduct {
  userId: string;
  productId: string;
  status: TrackStatus;
  rating: number | null;
  ratingPublic: boolean;
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
  position: number;
  addedAt: string;
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

/** A review as other people see it: author + only the publicly shared rating. */
export interface PublicReview extends Review {
  author: Profile;
  publicRating: number | null;
}

export interface CollectionWithItems extends Collection {
  owner: Profile;
  items: (CollectionItem & { product: Product })[];
}

export interface RatingStats {
  count: number;
  average: number | null;
}

export type FeedEntry =
  | { kind: "review"; at: string; review: PublicReview; product: Product }
  | { kind: "collection"; at: string; collection: CollectionWithItems };

export interface ProductFilter {
  q?: string;
  category?: CategoryId | null;
}
