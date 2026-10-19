"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { btn, EmptyState, errMsg, ErrorState, input, Loading, ProductImage, ProfileLink, useToast } from "@/components/ui";
import { useCurrentUserId, useQuery, useStore } from "@/lib/data/provider";
import { RankFlow } from "@/components/RankFlow";
import { rankNumbers } from "@/lib/ranking";
import type { CollectionWithItems, OrderEntry, Product } from "@/lib/types";

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const userId = useCurrentUserId();
  const { data: c, loading, error } = useQuery((s) => s.getCollection(id), [id, userId]);

  if (error) return <ErrorState message={error} />;
  if (loading && c === undefined) return <Loading />;
  if (!c)
    return (
      <EmptyState title="This collection isn't available" action={<Link href="/" className={btn.primary}>Go to Discover</Link>}>
        It may be private, deleted, or saved in a different browser (local demo links only work where they were made).
      </EmptyState>
    );
  return c.ownerId === userId ? <OwnerView c={c} /> : <PublicView c={c} />;
}

function Header({ c }: { c: CollectionWithItems }) {
  return (
    <>
      <p className="text-sm text-ink-soft">
        Ranking by <ProfileLink profile={c.owner} />
      </p>
      <h1 className="h-display mt-2 text-3xl font-bold leading-tight">{c.title}</h1>
      {c.description && <p className="mt-1 text-ink-soft">{c.description}</p>}
    </>
  );
}

function PublicView({ c }: { c: CollectionWithItems }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Header c={c} />
      <ShareButton c={c} />
      {placedItems(c).length === 0 ? (
        <p className="mt-6 text-ink-soft">Nothing ranked yet.</p>
      ) : (
        <ol className="mt-5 space-y-2">
          {placedItems(c).map((i, idx, arr) => (
            <li key={i.productId}>
              <Link href={`/products/${i.product.slug}`} className="flex items-center gap-3 rounded-2xl card bg-paper p-2 pr-4 hover:bg-crust">
                <Rank n={rankNumbers(arr)[idx]} />
                <ProductImage product={i.product} className="h-14 w-14 shrink-0 rounded-xl" />
                <span className="font-semibold">{i.product.name}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function placedItems(c: CollectionWithItems) {
  return c.items.filter((i) => i.position != null);
}

function Rank({ n }: { n: number }) {
  return (
    <span
      className={`h-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
        n === 1 ? "bg-saffron text-white" : n <= 3 ? "bg-saffron-soft text-[#7a5300]" : "bg-crust text-ink-soft"
      }`}
    >
      {n}
    </span>
  );
}

function ShareButton({ c }: { c: CollectionWithItems }) {
  const toast = useToast();
  if (c.visibility !== "public") return null;
  return (
    <button
      type="button"
      className={`${btn.secondary} mt-3`}
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share) await navigator.share({ title: c.title, url });
          else {
            await navigator.clipboard.writeText(url);
            toast("Link copied");
          }
        } catch {
          /* share sheet dismissed */
        }
      }}
    >
      Share ranking
    </button>
  );
}

function OwnerView({ c }: { c: CollectionWithItems }) {
  const store = useStore();
  const toast = useToast();
  const router = useRouter();
  const { data: profile } = useQuery((s) => s.getProfile(c.ownerId), [c.ownerId]);
  const toOrder = () => placedItems(c).map((i) => ({ productId: i.productId, tiedWithPrev: i.tiedWithPrev }));
  const [order, setOrder] = useState<OrderEntry[]>(toOrder);
  const [placing, setPlacing] = useState<Product | null>(null);
  const unplaced = c.items.filter((i) => i.position == null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [description, setDescription] = useState(c.description ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Keep local order in sync with the stored order (e.g. after add/remove).
  const storedOrder = JSON.stringify(toOrder());
  const [syncedOrder, setSyncedOrder] = useState(storedOrder);
  if (syncedOrder !== storedOrder) {
    setSyncedOrder(storedOrder);
    setOrder(JSON.parse(storedOrder));
  }
  const ids = order.map((e) => e.productId);
  const ranks = rankNumbers(order);

  const byId = useMemo(() => new Map(c.items.map((i) => [i.productId, i.product])), [c.items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function commitOrder(next: OrderEntry[]) {
    const prev = order;
    next = next.map((e, i) => (i === 0 ? { ...e, tiedWithPrev: false } : e));
    setOrder(next); // optimistic
    setSaveError(null);
    try {
      await store.saveOrder(c.id, next);
    } catch (e) {
      setOrder(prev);
      setSaveError(errMsg(e));
    }
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    moveTo(String(e.active.id), ids.indexOf(String(e.over.id)));
  }

  /** A hand-moved item leaves any tie; whoever was tied to it stays tied to its old neighbor. */
  function moveTo(pid: string, to: number) {
    const from = ids.indexOf(pid);
    if (to < 0 || to >= order.length || from === to) return;
    const detached = order.map((e, i) => (i === from + 1 && e.tiedWithPrev ? { ...e, tiedWithPrev: order[from].tiedWithPrev } : e));
    commitOrder(arrayMove(detached, from, to).map((e) => (e.productId === pid ? { ...e, tiedWithPrev: false } : e)));
  }

  function move(pid: string, delta: -1 | 1) {
    moveTo(pid, ids.indexOf(pid) + delta);
  }

  function toggleTie(pid: string) {
    commitOrder(order.map((e) => (e.productId === pid ? { ...e, tiedWithPrev: !e.tiedWithPrev } : e)));
  }

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    try {
      await store.updateCollection(c.id, { title: title.trim(), description: description.trim() || null });
      setEditing(false);
      toast("Saved");
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  const pinned = profile?.pinnedCollectionId === c.id;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/me?tab=rankings" className="text-sm font-semibold text-ink-soft hover:underline">
        ← My rankings
      </Link>

      {editing ? (
        <form onSubmit={saveMeta} className="mt-3 space-y-2 rounded-3xl card bg-paper p-4">
          <label htmlFor="c-title" className="text-sm font-semibold">
            Title
          </label>
          <input id="c-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <label htmlFor="c-desc" className="text-sm font-semibold">
            Description (optional)
          </label>
          <textarea id="c-desc" className={input} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} />
          <div className="flex gap-2">
            <button className={btn.primary}>Save</button>
            <button type="button" className={btn.ghost} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          <h1 className="h-display text-3xl font-bold leading-tight">{c.title}</h1>
          {c.description && <p className="mt-1 text-ink-soft">{c.description}</p>}
          <button className="mt-1 text-sm font-semibold text-tomato underline" onClick={() => setEditing(true)}>
            Edit details
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Visibility" className="inline-flex rounded-full bg-crust p-1">
          {(["private", "public"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={c.visibility === v}
              onClick={async () => {
                await store.updateCollection(c.id, { visibility: v });
                toast(v === "public" ? "Now public — anyone with the link can view it" : "Now private");
              }}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${c.visibility === v ? "bg-paper shadow-sm" : "text-ink-soft"}`}
            >
              {v === "public" ? "Public" : "🔒 Private"}
            </button>
          ))}
        </div>
        {c.visibility === "public" && (
          <button
            type="button"
            aria-pressed={pinned}
            className={btn.secondary}
            onClick={async () => {
              try {
                await store.updateMyProfile({ pinnedCollectionId: pinned ? null : c.id });
                toast(pinned ? "Unpinned from profile" : "Pinned as your favorites");
              } catch (e) {
                toast(errMsg(e), "error");
              }
            }}
          >
            {pinned ? "★ Pinned to profile" : "☆ Pin to profile"}
          </button>
        )}
        <ShareButton c={c} />
      </div>

      {saveError && (
        <div className="mt-3">
          <ErrorState message={saveError} />
        </div>
      )}

      <h2 className="sr-only">Ranked products</h2>
      {unplaced.length > 0 && (
        <section className="mt-6 rounded-3xl bg-saffron-soft p-4" aria-labelledby="unplaced-h">
          <h2 id="unplaced-h" className="font-semibold">
            Waiting to be placed
          </h2>
          <p className="text-sm text-ink-soft">A few quick “which did you prefer?” questions will find each one&apos;s spot.</p>
          <ul className="mt-3 space-y-2">
            {unplaced.map((i) => (
              <li key={i.productId} className="flex items-center gap-3 rounded-2xl bg-paper p-2">
                <ProductImage product={i.product} className="h-11 w-11 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1 truncate font-medium">{i.product.name}</span>
                <button type="button" className={btn.primary} onClick={() => (order.length ? setPlacing(i.product) : commitOrder([{ productId: i.productId, tiedWithPrev: false }]))}>
                  Place
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {placing && <RankFlow collection={c} product={placing} onClose={() => setPlacing(null)} />}

      {order.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing ranked yet">Add products below, or from any product page.</EmptyState>
        </div>
      ) : (
        <>
          <p className="mt-5 text-sm text-ink-soft">Drag, or use the arrows, to fine-tune. “=” ties an item with the one above. Changes save instantly and only affect this ranking.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol className="mt-3 space-y-2">
                {order.map(({ productId: pid, tiedWithPrev }, idx) => {
                  const p = byId.get(pid);
                  return p ? (
                    <SortableRow
                      key={pid}
                      product={p}
                      index={idx}
                      rank={ranks[idx]}
                      tied={tiedWithPrev}
                      count={order.length}
                      onMove={(d) => move(pid, d)}
                      onTie={() => toggleTie(pid)}
                      onRemove={async () => {
                        await store.removeFromCollection(c.id, pid);
                        toast(`Removed ${p.name}`);
                      }}
                    />
                  ) : null;
                })}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}

      <AddProducts collection={c} onPlace={setPlacing} />

      <button
        type="button"
        className="mt-10 text-sm text-tomato-dark underline"
        onClick={async () => {
          if (!confirm(`Delete “${c.title}”? Products stay in your Tried and Want-to-try lists.`)) return;
          await store.deleteCollection(c.id);
          router.push("/me?tab=rankings");
        }}
      >
        Delete this ranking
      </button>
    </div>
  );
}

function SortableRow({
  product,
  index,
  rank,
  tied,
  count,
  onMove,
  onTie,
  onRemove,
}: {
  product: Product;
  index: number;
  rank: number;
  tied: boolean;
  count: number;
  onMove: (d: -1 | 1) => void;
  onTie: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-2xl border bg-paper p-2 ${isDragging ? "z-10 border-saffron shadow-xl" : "border-line"}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${product.name}, currently number ${rank}`}
        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-soft hover:bg-crust active:cursor-grabbing"
      >
        <svg viewBox="0 0 10 16" className="h-4 w-3" fill="currentColor" aria-hidden>
          {[2, 8, 14].map((y) => [2, 8].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" />))}
        </svg>
      </button>
      <Rank n={rank} />
      <Link href={`/products/${product.slug}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
        <ProductImage product={product} className="hidden h-12 w-12 shrink-0 rounded-lg sm:flex" />
        <span className="line-clamp-2 font-semibold leading-tight">{product.name}</span>
      </Link>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${product.name} up`} className="h-11 w-9 rounded-full text-lg hover:bg-crust disabled:opacity-25">
          ↑
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${product.name} down`} className="h-11 w-9 rounded-full text-lg hover:bg-crust disabled:opacity-25">
          ↓
        </button>
        <button
          type="button"
          onClick={onTie}
          disabled={index === 0}
          aria-pressed={tied}
          aria-label={`Tie ${product.name} with the item above`}
          className={`h-11 w-9 rounded-full text-lg font-semibold disabled:opacity-25 ${tied ? "bg-saffron-soft text-[#7a5300]" : "text-ink-soft hover:bg-crust"}`}
        >
          =
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${product.name} from this ranking`} className="h-11 w-9 rounded-full text-lg text-ink-soft hover:bg-crust">
          ×
        </button>
      </div>
    </li>
  );
}

function AddProducts({ collection, onPlace }: { collection: CollectionWithItems; onPlace: (p: Product) => void }) {
  const store = useStore();
  const toast = useToast();
  const [q, setQ] = useState("");
  const mine = useQuery((s) => s.myUserProducts(), []);
  const results = useQuery((s) => s.listProducts({ q }), [q]);
  const inCollection = new Set(collection.items.map((i) => i.productId));
  const triedIds = new Set((mine.data ?? []).filter((u) => u.status === "tried").map((u) => u.productId));

  // Default suggestions: things you've tried that aren't ranked here yet.
  const list = (results.data ?? [])
    .filter((p) => !inCollection.has(p.id) && (q.trim() ? true : triedIds.has(p.id)))
    .slice(0, 8);

  return (
    <section className="mt-8 rounded-3xl bg-crust p-4">
      <h2 className="font-semibold">Add products</h2>
      <label htmlFor="add-search" className="sr-only">
        Search products to add
      </label>
      <input id="add-search" type="search" className={`${input} mt-2`} placeholder="Search the catalog" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q.trim() && <p className="mt-2 text-sm text-ink-soft">{list.length ? "From your Tried list:" : "Search to add anything from the catalog."}</p>}
      <ul className="mt-2 space-y-1">
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between rounded-xl bg-paper px-3 text-left hover:bg-cream"
              onClick={async () => {
                try {
                  const { placed } = await store.addToCollection(collection.id, p.id);
                  if (placed) toast("Added as #1");
                  else onPlace(p);
                } catch (e) {
                  toast(errMsg(e), "error");
                }
              }}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-2 shrink-0 font-semibold text-tomato">+ Add</span>
            </button>
          </li>
        ))}
        {q.trim() && results.data && list.length === 0 && <li className="text-sm text-ink-soft">No products to add for “{q}”.</li>}
      </ul>
    </section>
  );
}
