import { rankNumbers, toGroups } from "./ranking";
import type { OrderEntry } from "./types";

/**
 * Scores are DERIVED, never typed in. A person sorts what they tried into a
 * tier (loved / fine / didn't like) and guided comparisons order it inside that
 * tier. Each tier maps to a band of the 1–10 scale; position inside the band
 * comes from rank, so the best thing you loved approaches 10.0.
 *
 *   score = lo + (hi − lo) × (G − g) / (G + 1)     g = tie-group index (0 = best), G = groups in tier
 *
 * With one item it sits mid-band; ties share a score; rounded to one decimal.
 */

export const TIERS = [
  { id: "loved", label: "Loved it", lo: 7.0, hi: 10.0 },
  { id: "fine", label: "It was fine", lo: 4.0, hi: 6.9 },
  { id: "disliked", label: "Didn't like it", lo: 1.0, hi: 3.9 },
] as const;

export type Tier = (typeof TIERS)[number]["id"];

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Scores for one tier's confirmed order. */
export function scoresForTier(tier: Tier, order: OrderEntry[]): Map<string, number> {
  const band = TIERS.find((t) => t.id === tier)!;
  const groups = toGroups(order);
  const G = groups.length;
  const out = new Map<string, number>();
  groups.forEach((group, g) => {
    const s = round1(band.lo + ((band.hi - band.lo) * (G - g)) / (G + 1));
    group.forEach((pid) => out.set(pid, s));
  });
  return out;
}

export interface TierRow {
  productId: string;
  tier: Tier | null;
  tierPosition: number | null;
  tiedWithPrev: boolean;
}

/** All of one person's scores from their user_products rows. */
export function scoresFor(rows: TierRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of TIERS) {
    const order = rows
      .filter((r) => r.tier === t.id && r.tierPosition != null)
      .sort((a, b) => a.tierPosition! - b.tierPosition!)
      .map((r) => ({ productId: r.productId, tiedWithPrev: r.tiedWithPrev }));
    scoresForTier(t.id, order).forEach((v, k) => out.set(k, v));
  }
  return out;
}

export const formatScore = (s: number) => s.toFixed(1);
export { rankNumbers };
