"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/data/provider";
import { answer, applyOutcome, isStuck, rankNumbers, startSearch, type PlacementSearch } from "@/lib/ranking";
import type { CollectionWithItems, ComparisonResult, OrderEntry, Product } from "@/lib/types";
import { btn, errMsg, ProductImage, useToast } from "./ui";

/**
 * Guided placement: asks "which did you prefer?" against well-chosen items
 * (binary insertion) until the product's spot is known, then lets the user
 * confirm, compare again, or adjust by hand. Nothing is placed until confirmed.
 */
export function RankFlow({ collection, product, onClose }: { collection: CollectionWithItems; product: Product; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const placedOrder: OrderEntry[] = useMemo(
    () => collection.items.filter((i) => i.position != null).map((i) => ({ productId: i.productId, tiedWithPrev: i.tiedWithPrev })),
    [collection.items],
  );
  const products = useMemo(() => new Map(collection.items.map((i) => [i.productId, i.product])), [collection.items]);
  const [search, setSearch] = useState<PlacementSearch>(() => startSearch(placedOrder, product.id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const close = () => ref.current?.close();

  function respond(result: ComparisonResult) {
    const other = search.pivot!;
    setSearch((s) => answer(s, result));
    store
      .recordComparison({ collectionId: collection.id, productId: product.id, otherProductId: other, result })
      .catch((e) => toast(errMsg(e), "error"));
  }

  async function confirm(then?: "manual") {
    setSaving(true);
    try {
      await store.saveOrder(collection.id, applyOutcome(search, product.id));
      toast(`Placed in “${collection.title}”`);
      close();
      if (then === "manual") router.push(`/collections/${collection.id}`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const pivot = search.pivot ? products.get(search.pivot) : null;
  const stuck = isStuck(search);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="rank-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-[28px] bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm md:m-auto md:max-w-lg md:rounded-[28px]"
    >
      <div className="max-h-[90vh] overflow-y-auto px-5 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <p className="text-center text-[13px] font-medium text-ink-soft">{collection.title}</p>

        {pivot && (
          <>
            <h2 id="rank-title" className="mt-1 text-center text-[22px] font-semibold tracking-tight">
              Which did you prefer?
            </h2>
            <p className="text-center text-[13px] text-ink-soft">Question {search.asked + 1} · usually just a few</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Choice product={product} label="Prefer this" onPick={() => respond("prefer_this")} highlight />
              <Choice product={pivot} label="Prefer that" onPick={() => respond("prefer_that")} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 whitespace-nowrap text-[15px]">
              <button type="button" className={btn.secondary} onClick={() => respond("same")}>
                About the same
              </button>
              <button type="button" className={btn.secondary} onClick={() => respond("unsure")}>
                I&apos;m not sure
              </button>
            </div>
            <button type="button" className={`${btn.ghost} mt-2 w-full`} onClick={close}>
              Leave unplaced for now
            </button>
          </>
        )}

        {stuck && (
          <div className="text-center">
            <h2 id="rank-title" className="mt-1 text-[22px] font-semibold tracking-tight">
              No more comparisons to try
            </h2>
            <p className="mt-1 text-[15px] text-ink-soft">
              You weren&apos;t sure about the remaining options. Leave it unplaced and come back later, or put it in for now and adjust by hand.
            </p>
            <div className="mt-5 grid gap-2">
              <button type="button" className={btn.primary} onClick={() => setSearch((s) => ({ ...s, outcome: { index: s.lo, tie: false } }))}>
                Put it at #{search.lo + 1} for now
              </button>
              <button type="button" className={btn.secondary} onClick={close}>
                Leave unplaced
              </button>
            </div>
          </div>
        )}

        {search.outcome && (
          <Result
            order={applyOutcome(search, product.id)}
            products={new Map([...products, [product.id, product]])}
            highlight={product.id}
            saving={saving}
            onConfirm={() => confirm()}
            onManual={() => confirm("manual")}
            onAgain={() => setSearch(startSearch(placedOrder, product.id))}
            canCompare={placedOrder.length > 0}
          />
        )}
      </div>
    </dialog>
  );
}

function Choice({ product, label, onPick, highlight }: { product: Product; label: string; onPick: () => void; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group flex flex-col overflow-hidden rounded-3xl bg-cream text-left ring-1 transition active:scale-[0.98] ${highlight ? "ring-tomato/40" : "ring-line"} hover:ring-2 hover:ring-tomato`}
    >
      <ProductImage product={product} className="aspect-square w-full" />
      <span className="line-clamp-2 px-3 pb-2 pt-2 text-[15px] font-semibold leading-tight">{product.name}</span>
      <span className="m-3 mt-auto rounded-full bg-tomato py-2.5 text-center text-[15px] font-semibold text-white">{label}</span>
    </button>
  );
}

function Result({
  order,
  products,
  highlight,
  saving,
  onConfirm,
  onManual,
  onAgain,
  canCompare,
}: {
  order: OrderEntry[];
  products: Map<string, Product>;
  highlight: string;
  saving: boolean;
  onConfirm: () => void;
  onManual: () => void;
  onAgain: () => void;
  canCompare: boolean;
}) {
  const ranks = rankNumbers(order);
  const idx = order.findIndex((e) => e.productId === highlight);
  const tied = order.filter((e, i) => ranks[i] === ranks[idx]).length > 1;
  return (
    <div>
      <h2 id="rank-title" className="mt-1 text-center text-[22px] font-semibold tracking-tight">
        #{ranks[idx]} of {order.length}
        {tied && <span className="text-ink-soft"> (tied)</span>}
      </h2>
      <p className="text-center text-[13px] text-ink-soft">Here&apos;s where it lands. Nothing changes until you confirm.</p>
      <ol className="mt-4 divide-y divide-line/70 overflow-hidden rounded-2xl bg-cream">
        {order.map((e, i) => (
          <li key={e.productId} className={`flex items-center gap-3 px-3 py-2.5 ${e.productId === highlight ? "bg-saffron-soft" : ""}`}>
            <span className="w-7 text-center text-[15px] font-semibold text-tomato">{ranks[i]}</span>
            <span className={`text-[15px] ${e.productId === highlight ? "font-semibold" : ""}`}>{products.get(e.productId)?.name}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 grid gap-2">
        <button type="button" className={btn.primary} onClick={onConfirm} disabled={saving}>
          {saving ? "Saving…" : "Looks right"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          {canCompare && (
            <button type="button" className={btn.secondary} onClick={onAgain} disabled={saving}>
              Compare again
            </button>
          )}
          <button type="button" className={`${btn.secondary} ${canCompare ? "" : "col-span-2"}`} onClick={onManual} disabled={saving}>
            Adjust by hand
          </button>
        </div>
      </div>
    </div>
  );
}
