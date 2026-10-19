"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { btn, categoryLabel, EmptyState, errMsg, ErrorState, input, Loading, ProductImage, Stars, useToast } from "@/components/ui";
import { useQuery, useStore } from "@/lib/data/provider";
import { CATEGORIES, type CategoryId, type Visibility } from "@/lib/types";

const TABS = [
  { id: "tried", label: "Tried" },
  { id: "want", label: "Want to try" },
  { id: "rankings", label: "Rankings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function MyListPage() {
  return (
    <RequireAuth>
      <Suspense>
        <MyList />
      </Suspense>
    </RequireAuth>
  );
}

function MyList() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "tried";

  return (
    <div>
      <h1 className="h-display text-3xl font-bold">My list</h1>
      <div role="tablist" aria-label="My list" className="mt-4 grid grid-cols-3 rounded-full bg-crust p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => router.replace(`/me?tab=${t.id}`, { scroll: false })}
            className={`min-h-11 rounded-full text-sm font-semibold ${tab === t.id ? "bg-paper text-ink shadow-sm" : "text-ink-soft"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === "rankings" ? <Rankings /> : <TrackedList status={tab === "tried" ? "tried" : "want_to_try"} />}
      </div>
    </div>
  );
}

function TrackedList({ status }: { status: "tried" | "want_to_try" }) {
  const { data, loading, error } = useQuery((s) => s.myUserProducts(), []);
  const catalog = useQuery((s) => s.listProducts(), []);
  const productById = useMemo(() => new Map((catalog.data ?? []).map((p) => [p.id, p])), [catalog.data]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<CategoryId | "">("");
  const [sort, setSort] = useState<"recent" | "rating" | "name">("recent");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? [])
      .filter((u) => u.status === status)
      .map((u) => ({ up: u, product: productById.get(u.productId)! }))
      .filter(({ product }) => product && (!category || product.category === category) && (!needle || product.name.toLowerCase().includes(needle)))
      .sort((a, b) =>
        sort === "name"
          ? a.product.name.localeCompare(b.product.name)
          : sort === "rating"
            ? (b.up.rating ?? 0) - (a.up.rating ?? 0)
            : b.up.updatedAt.localeCompare(a.up.updatedAt),
      );
  }, [data, productById, status, q, category, sort]);

  if (error) return <ErrorState message={error} />;
  if (catalog.error) return <ErrorState message={catalog.error} />;
  if ((loading && !data) || !catalog.data) return <Loading />;
  const total = (data ?? []).filter((u) => u.status === status).length;
  if (total === 0)
    return (
      <EmptyState
        title={status === "tried" ? "Nothing tried yet" : "Your want-to-try list is empty"}
        action={<Link href="/" className={btn.primary}>Find something to try</Link>}
      >
        {status === "tried"
          ? "Tap “Tried” on any product. Ratings, notes and rankings are optional."
          : "Tap “Want to try” on anything that catches your eye so you remember it next shop."}
      </EmptyState>
    );

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="my-search">
          Search my products
        </label>
        <input id="my-search" type="search" className={input} placeholder={`Search ${total} products`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="my-cat">
            Category
          </label>
          <select id="my-cat" className={`${input} sm:w-44`} value={category} onChange={(e) => setCategory(e.target.value as CategoryId | "")}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="my-sort">
            Sort
          </label>
          <select id="my-sort" className={`${input} sm:w-36`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recent">Recent</option>
            {status === "tried" && <option value="rating">Rating</option>}
            <option value="name">A–Z</option>
          </select>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-ink-soft">No matches in your list.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map(({ up, product }) => (
            <li key={product.id}>
              <Link href={`/products/${product.slug}`} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-2 pr-4 hover:bg-crust">
                <ProductImage product={product} className="h-16 w-16 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{product.name}</span>
                  <span className="text-sm text-ink-soft">{categoryLabel(product.category)}</span>
                  {up.notes && <span className="block truncate text-xs text-ink-soft">🔒 {up.notes}</span>}
                </span>
                {up.rating != null ? <Stars value={up.rating} size="text-sm" /> : status === "tried" && <span className="text-xs text-ink-soft">Not rated</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Rankings() {
  const store = useStore();
  const toast = useToast();
  const router = useRouter();
  const { data, loading, error } = useQuery((s) => s.myCollections(), []);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await store.createCollection({ title, visibility });
      router.push(`/collections/${c.id}`);
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  if (error) return <ErrorState message={error} />;
  if (loading && !data) return <Loading />;
  return (
    <div>
      {creating ? (
        <form onSubmit={create} className="mb-5 space-y-3 rounded-3xl border border-line bg-paper p-4">
          <label htmlFor="col-title" className="block text-sm font-semibold">
            Name your ranking
          </label>
          <input id="col-title" autoFocus className={input} placeholder="Favorite frozen meals" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-basil" checked={visibility === "public"} onChange={(e) => setVisibility(e.target.checked ? "public" : "private")} />
            Make it public (anyone with the link, and your profile)
          </label>
          <div className="flex gap-2">
            <button className={btn.primary} disabled={!title.trim()}>
              Create
            </button>
            <button type="button" className={btn.ghost} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className={`${btn.primary} mb-5 w-full sm:w-auto`} onClick={() => setCreating(true)}>
          + New ranking
        </button>
      )}

      {!data?.length ? (
        <EmptyState title="No rankings yet">
          Make ordered lists like “Best desserts” or “Fall products I’ve tried.” One product can sit in as many as you like, at a different spot in each.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/collections/${c.id}`} className="block rounded-3xl border border-line bg-paper p-4 hover:bg-crust">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="h-display text-lg font-semibold">{c.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.visibility === "public" ? "bg-basil-soft text-basil" : "bg-crust text-ink-soft"}`}>
                    {c.visibility === "public" ? "Public" : "🔒 Private"}
                  </span>
                </div>
                <ol className="mt-2 space-y-0.5 text-sm text-ink-soft">
                  {c.items.slice(0, 3).map((i, idx) => (
                    <li key={i.productId} className="truncate">
                      <span className="font-bold text-tomato">{idx + 1}.</span> {i.product.name}
                    </li>
                  ))}
                  {c.items.length === 0 && <li>Empty — add products from any product page.</li>}
                  {c.items.length > 3 && <li>+{c.items.length - 3} more</li>}
                </ol>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
