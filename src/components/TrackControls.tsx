"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUserId, useQuery, useStore } from "@/lib/data/provider";
import { rankNumbers } from "@/lib/ranking";
import type { Product, UserProduct } from "@/lib/types";
import { RankFlow, ScoreFlow } from "./RankFlow";
import { btn, errMsg, input, useToast } from "./ui";

function useSignInRedirect() {
  const router = useRouter();
  return () => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
}

/** Quick "Want to try" / "Tried" toggles used on cards and the product page. */
export function QuickTrack({ product, userProduct, compact }: { product: Product; userProduct: UserProduct | null; compact?: boolean }) {
  const store = useStore();
  const userId = useCurrentUserId();
  const toast = useToast();
  const toLogin = useSignInRedirect();
  const [sheetOpen, setSheetOpen] = useState(false);
  const status = userProduct?.status;

  async function toggle(target: UserProduct["status"]) {
    if (!userId) return toLogin();
    try {
      if (status === "tried" && target === "tried") {
        // Never silently drop a score/notes on a second tap; offer to (re)score instead.
        setSheetOpen(true);
      } else if (status === "tried" && userProduct?.score != null && !confirm("Move back to Want to try? This removes your score.")) {
        return;
      } else if (status === target) {
        await store.untrack(product.id);
        toast(target === "tried" ? "Removed from Tried" : "Removed from Want to try");
      } else {
        await store.setStatus(product.id, target);
        if (target === "tried") setSheetOpen(true);
        else toast("Saved to Want to try");
      }
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  const size = compact ? "min-h-11 px-3 text-sm whitespace-nowrap" : "min-h-12 px-4 whitespace-nowrap";
  return (
    <>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex gap-2"}>
        <button
          type="button"
          aria-pressed={status === "want_to_try"}
          onClick={() => toggle("want_to_try")}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border font-semibold ${size} ${
            status === "want_to_try" ? "border-transparent bg-saffron-soft text-[#6b4800]" : "border-transparent bg-ink/[0.05] text-ink hover:bg-ink/10"
          }`}
        >
          <span aria-hidden>{status === "want_to_try" ? "★" : "☆"}</span> Want to try
        </button>
        <button
          type="button"
          aria-pressed={status === "tried"}
          onClick={() => toggle("tried")}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border font-semibold ${size} ${
            status === "tried" ? "border-transparent bg-basil text-white" : "border-transparent bg-ink/[0.05] text-ink hover:bg-ink/10"
          }`}
        >
          <span aria-hidden>✓</span> Tried
        </button>
      </div>
      {sheetOpen && <ScoreFlow product={product} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/** Toggle membership of a product across the user's collections; create one inline. */
export function CollectionPicker({ product }: { product: Product }) {
  const productId = product.id;
  const store = useStore();
  const toast = useToast();
  const { data: cols, loading } = useQuery((s) => s.myCollections(), []);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const placingCol = cols?.find((c) => c.id === placing);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const c = await store.createCollection({ title, visibility: "private" });
      await store.addToCollection(c.id, productId);
      setTitle("");
      toast(`Added to “${c.title}”`);
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(colId: string, inIt: boolean, name: string) {
    try {
      if (inIt) {
        await store.removeFromCollection(colId, productId);
        toast(`Removed from “${name}”`);
        return;
      }
      const { placed } = await store.addToCollection(colId, productId);
      if (placed) toast(`#1 in “${name}”`);
      else setPlacing(colId); // guide placement by comparison
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  if (loading && !cols) return <p className="text-sm text-ink-soft">Loading collections…</p>;
  return (
    <div className="space-y-2">
      {cols?.map((c) => {
        const item = c.items.find((i) => i.productId === productId);
        const inIt = !!item;
        const placed = c.items.filter((i) => i.position != null);
        const rank = item?.position != null ? rankNumbers(placed)[placed.findIndex((i) => i.productId === productId)] : null;
        return (
          <div key={c.id} className="flex gap-2">
          <button
            type="button"
            aria-pressed={inIt}
            onClick={() => toggle(c.id, inIt, c.title)}
            className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left ${inIt ? "border-basil bg-basil-soft" : "border-line bg-paper hover:bg-crust"}`}
          >
            <span className="font-medium">{c.title}</span>
            <span className="text-sm text-ink-soft">
              {!inIt ? `${c.items.length} items` : rank ? `#${rank} of ${placed.length} ✓` : "Not placed yet"}
            </span>
          </button>
          {inIt && rank == null && (
            <button type="button" className={btn.primary} onClick={() => setPlacing(c.id)}>
              Place
            </button>
          )}
          </div>
        );
      })}
      <form onSubmit={create} className="flex gap-2">
        <label className="sr-only" htmlFor={`new-col-${productId}`}>
          New collection name
        </label>
        <input
          id={`new-col-${productId}`}
          className={input}
          placeholder="New ranking, e.g. Best frozen meals"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
        <button className={btn.secondary} disabled={busy || !title.trim()}>
          Create
        </button>
      </form>
      {placingCol && product && <RankFlow collection={placingCol} product={product} onClose={() => setPlacing(null)} />}
    </div>
  );
}
