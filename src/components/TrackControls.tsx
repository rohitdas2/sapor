"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCurrentUserId, useQuery, useStore } from "@/lib/data/provider";
import type { Product, UserProduct } from "@/lib/types";
import { btn, errMsg, input, RatingInput, useToast } from "./ui";

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
        // Never silently drop a rating/notes on a second tap; open details instead.
        setSheetOpen(true);
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

  const size = compact ? "min-h-11 px-3 text-sm whitespace-nowrap" : "min-h-12 px-5";
  return (
    <>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex gap-2"}>
        <button
          type="button"
          aria-pressed={status === "want_to_try"}
          onClick={() => toggle("want_to_try")}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border font-semibold ${size} ${
            status === "want_to_try" ? "border-saffron bg-saffron-soft text-[#6b4800]" : "border-line bg-paper text-ink hover:bg-crust"
          }`}
        >
          <span aria-hidden>{status === "want_to_try" ? "★" : "☆"}</span> Want to try
        </button>
        <button
          type="button"
          aria-pressed={status === "tried"}
          onClick={() => toggle("tried")}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border font-semibold ${size} ${
            status === "tried" ? "border-basil bg-basil text-white" : "border-line bg-paper text-ink hover:bg-crust"
          }`}
        >
          <span aria-hidden>✓</span> Tried
        </button>
      </div>
      {sheetOpen && <TriedSheet product={product} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/** Bottom sheet shown right after marking tried. Every field is optional. */
export function TriedSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { data: up } = useQuery((s) => s.myUserProduct(product.id), [product.id]);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // No close() in cleanup: it would fire onClose during StrictMode's re-run.
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  async function patch(p: Parameters<typeof store.updateUserProduct>[1]) {
    try {
      await store.updateUserProduct(product.id, p);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="tried-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-paper p-0 text-ink backdrop:bg-ink/40 md:m-auto md:max-w-md md:rounded-3xl"
    >
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <p className="text-sm font-semibold text-basil">✓ Marked as tried</p>
        <h2 id="tried-title" className="h-display mt-1 text-2xl font-semibold">
          {product.name}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Add details now or later — all optional.</p>

        <div className="mt-5">
          <p className="mb-1 text-sm font-semibold">How was it?</p>
          <RatingInput value={up?.rating ?? null} onChange={(rating) => patch({ rating })} />
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-5 w-5 accent-basil"
              checked={up?.ratingPublic ?? false}
              onChange={(e) => patch({ ratingPublic: e.target.checked })}
            />
            Share my rating in community averages
          </label>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">Add to a ranking</p>
          <CollectionPicker productId={product.id} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={btn.primary} onClick={() => ref.current?.close()}>
            Done
          </button>
          <Link href={`/products/${product.slug}#review`} className={btn.secondary} onClick={() => ref.current?.close()}>
            Write a review
          </Link>
        </div>
      </div>
    </dialog>
  );
}

/** Toggle membership of a product across the user's collections; create one inline. */
export function CollectionPicker({ productId }: { productId: string }) {
  const store = useStore();
  const toast = useToast();
  const { data: cols, loading } = useQuery((s) => s.myCollections(), []);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (inIt) await store.removeFromCollection(colId, productId);
      else await store.addToCollection(colId, productId);
      toast(inIt ? `Removed from “${name}”` : `Added to “${name}”`);
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  if (loading && !cols) return <p className="text-sm text-ink-soft">Loading collections…</p>;
  return (
    <div className="space-y-2">
      {cols?.map((c) => {
        const idx = c.items.findIndex((i) => i.productId === productId);
        const inIt = idx >= 0;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={inIt}
            onClick={() => toggle(c.id, inIt, c.title)}
            className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left ${inIt ? "border-basil bg-basil-soft" : "border-line bg-paper hover:bg-crust"}`}
          >
            <span className="font-medium">{c.title}</span>
            <span className="text-sm text-ink-soft">{inIt ? `#${idx + 1} of ${c.items.length} ✓` : `${c.items.length} items`}</span>
          </button>
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
    </div>
  );
}
