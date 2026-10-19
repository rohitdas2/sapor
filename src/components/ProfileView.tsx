"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUserId, useQuery, useStore } from "@/lib/data/provider";
import type { CollectionWithItems } from "@/lib/types";
import { Feed, FeedEmpty } from "./Feed";
import { Avatar, btn, DemoBadge, EmptyState, errMsg, ErrorState, input, Loading, ProductImage, useToast } from "./ui";

export function ProfileView({ userId }: { userId: string }) {
  const me = useCurrentUserId();
  const isOwner = me === userId;
  const profile = useQuery((s) => s.getProfile(userId), [userId]);
  const collections = useQuery((s) => s.publicCollectionsByUser(userId), [userId]);
  const [editing, setEditing] = useState(false);

  if (profile.error) return <ErrorState message={profile.error} />;
  if (profile.loading && profile.data === undefined) return <Loading />;
  const p = profile.data;
  if (!p) return <EmptyState title="Profile not found">This person may not exist in this browser&apos;s demo data.</EmptyState>;

  const pinned = collections.data?.find((c) => c.id === p.pinnedCollectionId);
  const others = collections.data?.filter((c) => c.id !== p.pinnedCollectionId) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      {editing ? (
        <EditProfile name={p.displayName} bio={p.bio ?? ""} onDone={() => setEditing(false)} />
      ) : (
        <header className="flex items-center gap-4">
          <Avatar name={p.displayName} url={p.avatarUrl} size={72} />
          <div className="min-w-0">
            <h1 className="h-display text-2xl font-bold">{p.displayName}</h1>
            {p.isDemo && <DemoBadge />}
            {p.bio && <p className="mt-1 text-ink-soft">{p.bio}</p>}
            {isOwner && (
              <button className="mt-1 text-sm font-semibold text-tomato underline" onClick={() => setEditing(true)}>
                Edit profile
              </button>
            )}
          </div>
        </header>
      )}

      <section className="mt-8" aria-labelledby="fav-h">
        <h2 id="fav-h" className="h-display text-xl font-semibold">
          ★ Favorites
        </h2>
        {pinned ? (
          <PinnedFavorites c={pinned} />
        ) : (
          <p className="mt-2 text-ink-soft">
            {isOwner ? "Pin one of your public rankings to show your favorites here." : "No favorites pinned yet."}
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="rank-h">
        <h2 id="rank-h" className="h-display text-xl font-semibold">
          Public rankings
        </h2>
        {others.length === 0 ? (
          <p className="mt-2 text-ink-soft">{pinned ? "No other public rankings." : "No public rankings yet."}</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {others.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${c.id}`} className="block rounded-3xl border border-line bg-paper p-4 hover:bg-crust">
                  <span className="h-display font-semibold">{c.title}</span>
                  <span className="block text-sm text-ink-soft">{c.items.length} ranked</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && <PrivateSection />}

      <section className="mt-8" aria-labelledby="act-h">
        <h2 id="act-h" className="h-display mb-3 text-xl font-semibold">
          Recent public activity
        </h2>
        <Feed userId={userId} empty={<FeedEmpty>{isOwner ? "Publish a review or make a ranking public and it'll show here." : null}</FeedEmpty>} />
      </section>
    </div>
  );
}

function PinnedFavorites({ c }: { c: CollectionWithItems }) {
  return (
    <Link href={`/collections/${c.id}`} className="mt-3 block rounded-3xl bg-paper p-4 shadow-sm ring-1 ring-line hover:bg-crust">
      <span className="text-sm font-semibold text-ink-soft">{c.title}</span>
      <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {c.items.slice(0, 5).map((i, idx) => (
          <li key={i.productId} className="relative">
            <ProductImage product={i.product} className="aspect-square w-full rounded-2xl" />
            <span className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-saffron text-sm font-bold text-white">{idx + 1}</span>
            <span className="mt-1 block text-xs font-medium leading-tight">{i.product.name}</span>
          </li>
        ))}
      </ol>
    </Link>
  );
}

function PrivateSection() {
  const store = useStore();
  const router = useRouter();
  const ups = useQuery((s) => s.myUserProducts(), []);
  const cols = useQuery((s) => s.myCollections(), []);
  const catalog = useQuery((s) => s.listProducts(), []);
  const productById = new Map((catalog.data ?? []).map((p) => [p.id, p]));
  const want = (ups.data ?? []).filter((u) => u.status === "want_to_try");
  const notes = (ups.data ?? []).filter((u) => u.notes);
  const privateCols = (cols.data ?? []).filter((c) => c.visibility === "private");

  return (
    <section className="mt-8 rounded-3xl border-2 border-dashed border-line p-4" aria-labelledby="priv-h">
      <h2 id="priv-h" className="font-semibold">
        🔒 Only you can see this
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Link href="/me?tab=want" className="rounded-2xl bg-paper p-3 hover:bg-crust">
          <span className="h-display block text-2xl font-bold">{want.length}</span>
          <span className="text-xs text-ink-soft">Want to try</span>
        </Link>
        <Link href="/me?tab=tried" className="rounded-2xl bg-paper p-3 hover:bg-crust">
          <span className="h-display block text-2xl font-bold">{notes.length}</span>
          <span className="text-xs text-ink-soft">Private notes</span>
        </Link>
        <Link href="/me?tab=rankings" className="rounded-2xl bg-paper p-3 hover:bg-crust">
          <span className="h-display block text-2xl font-bold">{privateCols.length}</span>
          <span className="text-xs text-ink-soft">Private rankings</span>
        </Link>
      </div>
      {want.length > 0 && (
        <p className="mt-3 truncate text-sm text-ink-soft">
          Next to try: {want.slice(0, 3).map((u) => productById.get(u.productId)?.name).join(", ")}
        </p>
      )}
      <button
        className={`${btn.ghost} mt-3`}
        onClick={async () => {
          await store.signOut();
          router.push("/");
        }}
      >
        Sign out
      </button>
    </section>
  );
}

function EditProfile({ name, bio, onDone }: { name: string; bio: string; onDone: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [n, setN] = useState(name);
  const [b, setB] = useState(bio);
  return (
    <form
      className="space-y-2 rounded-3xl border border-line bg-paper p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await store.updateMyProfile({ displayName: n, bio: b });
          toast("Profile saved");
          onDone();
        } catch (err) {
          toast(errMsg(err), "error");
        }
      }}
    >
      <label htmlFor="pf-name" className="text-sm font-semibold">
        Display name
      </label>
      <input id="pf-name" className={input} value={n} onChange={(e) => setN(e.target.value)} maxLength={40} />
      <label htmlFor="pf-bio" className="text-sm font-semibold">
        Short bio (optional, public)
      </label>
      <textarea id="pf-bio" className={input} value={b} onChange={(e) => setB(e.target.value)} maxLength={160} />
      <div className="flex gap-2">
        <button className={btn.primary}>Save</button>
        <button type="button" className={btn.ghost} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
