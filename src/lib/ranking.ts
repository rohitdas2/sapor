import type { ComparisonResult, OrderEntry } from "./types";

/** Split an ordered list into tie groups: [[a], [b, c], [d]] means b and c share a rank. */
export function toGroups(order: OrderEntry[]): string[][] {
  const groups: string[][] = [];
  order.forEach((e, i) => {
    if (i > 0 && e.tiedWithPrev) groups[groups.length - 1].push(e.productId);
    else groups.push([e.productId]);
  });
  return groups;
}

export function fromGroups(groups: string[][]): OrderEntry[] {
  return groups.flatMap((g) => g.map((productId, i) => ({ productId, tiedWithPrev: i > 0 })));
}

/** Competition ranking: ties share a number, the next rank skips (1, 2, 2, 4). */
export function rankNumbers(order: OrderEntry[]): number[] {
  const ranks: number[] = [];
  order.forEach((e, i) => ranks.push(i > 0 && e.tiedWithPrev ? ranks[i - 1] : i + 1));
  return ranks;
}

/**
 * Binary-insertion search over tie groups. Each answer halves the range, so a
 * product finds its spot among n groups in about log2(n) comparisons.
 */
export interface PlacementSearch {
  groups: string[][]; // placed groups, excluding the product being placed
  lo: number; // insertion index range [lo, hi]
  hi: number;
  unsure: string[]; // products the user couldn't compare against; never asked again
  pivotGroup: number | null;
  pivot: string | null;
  asked: number;
  outcome: { index: number; tie: boolean } | null;
}

export function startSearch(order: OrderEntry[], productId: string): PlacementSearch {
  const groups = toGroups(order.filter((e) => e.productId !== productId)).filter((g) => g.length);
  return pickPivot({ groups, lo: 0, hi: groups.length, unsure: [], pivotGroup: null, pivot: null, asked: 0, outcome: null });
}

/** Choose the most informative remaining comparison: the group nearest the middle of the range. */
function pickPivot(s: PlacementSearch): PlacementSearch {
  if (s.lo >= s.hi) return { ...s, pivotGroup: null, pivot: null, outcome: { index: s.lo, tie: false } };
  const mid = Math.floor((s.lo + s.hi) / 2);
  const candidates = Array.from({ length: s.hi - s.lo }, (_, i) => s.lo + i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  for (const g of candidates) {
    const pivot = s.groups[g].find((p) => !s.unsure.includes(p));
    if (pivot) return { ...s, pivotGroup: g, pivot };
  }
  return { ...s, pivotGroup: null, pivot: null }; // stuck: every option was "not sure"
}

export function isStuck(s: PlacementSearch) {
  return !s.outcome && !s.pivot;
}

export function answer(s: PlacementSearch, result: ComparisonResult): PlacementSearch {
  if (s.pivotGroup == null || !s.pivot) return s;
  const g = s.pivotGroup;
  const next = { ...s, asked: s.asked + 1 };
  switch (result) {
    case "prefer_this":
      return pickPivot({ ...next, hi: g });
    case "prefer_that":
      return pickPivot({ ...next, lo: g + 1 });
    case "same":
      return { ...next, pivotGroup: null, pivot: null, outcome: { index: g, tie: true } };
    case "unsure":
      // Not a preference: just try a different item.
      return pickPivot({ ...next, unsure: [...s.unsure, s.pivot] });
  }
}

/** Apply an outcome to produce the new full order. */
export function applyOutcome(s: PlacementSearch, productId: string, outcome = s.outcome): OrderEntry[] {
  if (!outcome) return fromGroups(s.groups);
  const groups = s.groups.map((g) => [...g]);
  if (outcome.tie) groups[outcome.index].push(productId);
  else groups.splice(outcome.index, 0, [productId]);
  return fromGroups(groups);
}
