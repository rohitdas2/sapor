import raw from "@/data/catalog.json";
import type { CategoryId, Product, Retailer } from "../types";

// Date the starter catalog was assembled. Used as created_at for seeded rows.
export const CATALOG_SEEDED_AT = "2026-10-18T00:00:00.000Z";

export const RETAILER: Retailer = raw.retailer;

export const CATALOG: Product[] = raw.products.map((p) => ({
  id: `p-${p.slug}`,
  retailerId: raw.retailer.id,
  name: p.name,
  slug: p.slug,
  category: p.category as CategoryId,
  description: p.description,
  imageUrl: null,
  imageIsPlaceholder: true,
  emoji: p.emoji ?? null,
  photo: "photo" in p && p.photo ? p.photo : null,
  instagramUrl: "instagramUrl" in p && typeof p.instagramUrl === "string" ? p.instagramUrl : null,
  availability: p.availability as Product["availability"],
  sourceUrl: null,
  lastVerifiedAt: null,
  createdAt: CATALOG_SEEDED_AT,
  updatedAt: CATALOG_SEEDED_AT,
}));

export function matchesFilter(p: Product, q?: string, category?: string | null) {
  if (category && p.category !== category) return false;
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return (
    p.name.toLowerCase().includes(needle) ||
    p.description.toLowerCase().includes(needle) ||
    p.category.replace("-", " ").includes(needle)
  );
}
