"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMe, useStore } from "@/lib/data/provider";
import { answer, applyOutcome, isStuck, rankNumbers, startSearch, type PlacementSearch } from "@/lib/ranking";
import { scoresForTier, TIERS } from "@/lib/scores";
import type { CollectionWithItems, ComparisonResult, OrderEntry, Product, Tier } from "@/lib/types";
import { btn, errMsg, Loading, ProductImage, ScoreBadge, useToast } from "./ui";

/** Bottom sheet on phones, centered card on desktop. */
function Sheet({ onClose, children, sheetRef }: { onClose: () => void; children: React.ReactNode; sheetRef: React.RefObject<HTMLDialogElement | null> }) {
  useEffect(() => {
    // No close() in cleanup: it would fire onClose during StrictMode's re-run.
    if (sheetRef.current && !sheetRef.current.open) sheetRef.current.showModal();
  }, [sheetRef]);
  return (
    <dialog
      ref={sheetRef}
      onClose={onClose}
      aria-labelledby="rank-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-[28px] bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm md:m-auto md:max-w-lg md:rounded-[28px]"
    >
      <div className="max-h-[90vh] overflow-y-auto px-5 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line md:hidden" aria-hidden />
        {children}
      </div>
    </dialog>
  );
}

/**
 * Guided placement: asks "which did you prefer?" against well-chosen items
 * (binary insertion) until the product's spot is known, then lets the user
 * confirm or compare again. Nothing is saved until confirmed.
 */
function ComparisonBody({
  label,
  placedOrder,
  products,
  product,
  onAnswer,
  onConfirm,
  onLeave,
  onManual,
  resultHeading,
}: {
  label: string;
  placedOrder: OrderEntry[];
  products: Map<string, Product>;
  product: Product;
  onAnswer: (otherProductId: string, result: ComparisonResult) => void;
  onConfirm: (order: OrderEntry[]) => Promise<void>;
  onLeave: () => void;
  onManual?: (order: OrderEntry[]) => Promise<void>;
  resultHeading?: (order: OrderEntry[]) => React.ReactNode;
}) {
  const [search, setSearch] = useState<PlacementSearch>(() => startSearch(placedOrder, product.id));
  const [saving, setSaving] = useState(false);
  const pivot = search.pivot ? products.get(search.pivot) : null;
  const stuck = isStuck(search);

  function respond(result: ComparisonResult) {
    onAnswer(search.pivot!, result);
    setSearch((s) => answer(s, result));
  }

  async function finish(fn: (order: OrderEntry[]) => Promise<void>) {
    setSaving(true);
    try {
      await fn(applyOutcome(search, product.id));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="text-center text-[13px] font-medium text-ink-soft">{label}</p>
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
          <button type="button" className={`${btn.ghost} mt-2 w-full`} onClick={onLeave}>
            Leave unplaced for now
          </button>
        </>
      )}

      {stuck && (
        <div className="text-center">
          <h2 id="rank-title" className="mt-1 text-[22px] font-semibold tracking-tight">
            No more comparisons to try
          </h2>
          <p className="mt-1 text-[15px] text-ink-soft">You weren&apos;t sure about the remaining options. Leave it for later, or put it in for now.</p>
          <div className="mt-5 grid gap-2">
            <button type="button" className={btn.primary} onClick={() => setSearch((s) => ({ ...s, outcome: { index: s.lo, tie: false } }))}>
              Put it at #{search.lo + 1} for now
            </button>
            <button type="button" className={btn.secondary} onClick={onLeave}>
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
          heading={resultHeading}
          saving={saving}
          onConfirm={() => finish(onConfirm)}
          onManual={onManual ? () => finish(onManual) : undefined}
          onAgain={placedOrder.some((e) => e.productId !== product.id) ? () => setSearch(startSearch(placedOrder, product.id)) : undefined}
        />
      )}
    </>
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
  heading,
  saving,
  onConfirm,
  onManual,
  onAgain,
}: {
  order: OrderEntry[];
  products: Map<string, Product>;
  highlight: string;
  heading?: (order: OrderEntry[]) => React.ReactNode;
  saving: boolean;
  onConfirm: () => void;
  onManual?: () => void;
  onAgain?: () => void;
}) {
  const ranks = rankNumbers(order);
  const idx = order.findIndex((e) => e.productId === highlight);
  const tied = order.filter((_, i) => ranks[i] === ranks[idx]).length > 1;
  return (
    <div>
      <h2 id="rank-title" className="mt-1 text-center text-[22px] font-semibold tracking-tight">
        {heading ? (
          heading(order)
        ) : (
          <>
            #{ranks[idx]} of {order.length}
            {tied && <span className="text-ink-soft"> (tied)</span>}
          </>
        )}
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
        {(onAgain || onManual) && (
          <div className="grid grid-cols-2 gap-2">
            {onAgain && (
              <button type="button" className={`${btn.secondary} ${onManual ? "" : "col-span-2"}`} onClick={onAgain} disabled={saving}>
                Compare again
              </button>
            )}
            {onManual && (
              <button type="button" className={`${btn.secondary} ${onAgain ? "" : "col-span-2"}`} onClick={onManual} disabled={saving}>
                Adjust by hand
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Place a product inside one of the user's curated rankings. */
export function RankFlow({ collection, product, onClose }: { collection: CollectionWithItems; product: Product; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const placedOrder = useMemo(
    () => collection.items.filter((i) => i.position != null).map((i) => ({ productId: i.productId, tiedWithPrev: i.tiedWithPrev })),
    [collection.items],
  );
  const products = useMemo(() => new Map(collection.items.map((i) => [i.productId, i.product])), [collection.items]);

  async function save(order: OrderEntry[], manual = false) {
    try {
      await store.saveOrder(collection.id, order);
      toast(`Placed in “${collection.title}”`);
      ref.current?.close();
      if (manual) router.push(`/collections/${collection.id}`);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <Sheet onClose={onClose} sheetRef={ref}>
      <ComparisonBody
        label={collection.title}
        placedOrder={placedOrder}
        products={products}
        product={product}
        onAnswer={(other, result) =>
          store.recordComparison({ collectionId: collection.id, productId: product.id, otherProductId: other, result }).catch((e) => toast(errMsg(e), "error"))
        }
        onConfirm={(o) => save(o)}
        onManual={(o) => save(o, true)}
        onLeave={() => ref.current?.close()}
      />
    </Sheet>
  );
}

/**
 * Score a tried product: pick a tier, then compare against your other
 * products in that tier. The confirmed position becomes a 1–10 score.
 */
export function ScoreFlow({ product, onClose, initialTier }: { product: Product; onClose: () => void; initialTier?: Tier | null }) {
  const store = useStore();
  const me = useMe();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const [tier, setTier] = useState<Tier | null>(initialTier ?? null);
  const [tierItems, setTierItems] = useState<{ order: OrderEntry[]; products: Map<string, Product> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickTier(t: Tier) {
    setTier(t);
    setTierItems(null);
    setError(null);
    try {
      const items = await store.myTier(t);
      setTierItems({
        order: items.map((i) => ({ productId: i.productId, tiedWithPrev: i.tiedWithPrev })),
        products: new Map(items.map((i) => [i.productId, i.product])),
      });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  // Re-scoring from a known tier skips the first question.
  const started = useRef(false);
  useEffect(() => {
    if (initialTier && !started.current) {
      started.current = true;
      void pickTier(initialTier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const band = TIERS.find((t) => t.id === tier);
  return (
    <Sheet onClose={onClose} sheetRef={ref}>
      {!tier ? (
        <>
          <p className="text-center text-[13px] font-medium text-ink-soft">{product.name}</p>
          <h2 id="rank-title" className="mt-1 text-center text-[22px] font-semibold tracking-tight">
            How was it?
          </h2>
          <p className="text-center text-[13px] text-ink-soft">Then a few quick comparisons turn this into a 1–10 score.</p>
          <div className="mt-5 grid gap-2">
            {TIERS.map((t) => (
              <button key={t.id} type="button" onClick={() => pickTier(t.id)} className={`${btn.secondary} min-h-14 justify-between px-6 text-[17px]`}>
                <span>{t.id === "loved" ? "😍" : t.id === "fine" ? "🙂" : "😕"} {t.label}</span>
                <span className="text-[13px] font-medium text-ink-soft">
                  {t.lo.toFixed(1)}–{t.hi.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className={`${btn.ghost} mt-2 w-full`} onClick={() => ref.current?.close()}>
            Not now
          </button>
        </>
      ) : error ? (
        <p role="alert" className="py-6 text-center text-tomato-dark">
          {error}
        </p>
      ) : !tierItems ? (
        <Loading />
      ) : (
        <ComparisonBody
          key={tier}
          label={`${band!.label} · ${product.name}`}
          placedOrder={tierItems.order}
          products={tierItems.products}
          product={product}
          onAnswer={(other, result) =>
            store.recordComparison({ collectionId: null, productId: product.id, otherProductId: other, result }).catch((e) => toast(errMsg(e), "error"))
          }
          resultHeading={(order) => (
            <span className="inline-flex items-center gap-3">
              Your score <ScoreBadge score={scoresForTier(tier, order).get(product.id)!} size="lg" />
            </span>
          )}
          onConfirm={async (order) => {
            try {
              await store.saveTierOrder(tier, order);
              toast(me?.profile.shareScores ? "Score saved and shared" : "Score saved (private)");
              ref.current?.close();
            } catch (e) {
              toast(errMsg(e), "error");
            }
          }}
          onLeave={() => ref.current?.close()}
        />
      )}
    </Sheet>
  );
}
