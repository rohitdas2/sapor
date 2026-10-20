"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { InstagramEmbed } from "@/components/InstagramEmbed";
import { ScoreFlow } from "@/components/RankFlow";
import { CollectionPicker, QuickTrack } from "@/components/TrackControls";
import {
  AvailabilityBadge,
  btn,
  categoryLabel,
  EmptyState,
  errMsg,
  ErrorState,
  input,
  PhotoCredit,
  Loading,
  ProductImage,
  ProfileLink,
  ScoreBadge,
  timeAgo,
  useToast,
} from "@/components/ui";
import { useCurrentUserId, useQuery, useStore } from "@/lib/data/provider";
import type { Comment as ProductComment } from "@/lib/types";
import { MAX_PHOTOS_PER_REVIEW } from "@/lib/data/store";
import type { Product, Visibility } from "@/lib/types";

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const userId = useCurrentUserId();
  const product = useQuery((s) => s.getProductBySlug(slug), [slug]);
  const p = product.data;

  if (product.error) return <ErrorState message={product.error} />;
  if (product.loading && !p) return <Loading />;
  if (!p)
    return (
      <EmptyState title="Product not found" action={<Link href="/" className={btn.primary}>Back to Discover</Link>}>
        It may have been removed from the catalog.
      </EmptyState>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm font-semibold text-ink-soft hover:underline">
        ← Discover
      </Link>
      <div className="mt-3 overflow-hidden rounded-3xl card bg-paper">
        <ProductImage product={p} className="aspect-[16/10] w-full" />
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Trader Joe&apos;s · {categoryLabel(p.category)} <AvailabilityBadge product={p} />
          </div>
          <h1 className="h-display mt-1 text-3xl font-bold leading-tight">{p.name}</h1>
          <CommunityScore slug={p.slug} />
          <p className="mt-3 leading-relaxed">{p.description}</p>
          <PhotoCredit product={p} />
          <p className="mt-2 text-xs text-ink-soft">
            {p.availability === "seasonal" && "Usually a seasonal release. "}
            Sapor doesn&apos;t track store stock or prices.
            {p.lastVerifiedAt ? ` Details last checked ${new Date(p.lastVerifiedAt).toLocaleDateString()}.` : " Details not yet verified against the retailer."}
          </p>
        </div>
      </div>

      {userId ? <MyProductPanel product={p} /> : <SignInPrompt />}

      {p.instagramUrl && <InstagramEmbed url={p.instagramUrl} />}
      <PublicCollections product={p} />
      <CommunityReviews slug={p.slug} />
      <Comments slug={p.slug} />
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="mt-5 rounded-3xl bg-crust p-5">
      <p className="font-semibold">Keep track of this one</p>
      <p className="text-sm text-ink-soft">Sign in to save it, mark it tried, score it and add it to your rankings.</p>
      <Link href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`} className={`${btn.primary} mt-3`}>
        Sign in
      </Link>
    </div>
  );
}

function MyProductPanel({ product }: { product: Product }) {
  const store = useStore();
  const toast = useToast();
  const { data: up, loading } = useQuery((s) => s.myUserProduct(product.id), [product.id]);
  const [scoring, setScoring] = useState(false);
  const [notes, setNotes] = useState(up?.notes ?? "");
  const [syncedNotes, setSyncedNotes] = useState(up?.notes);
  if (syncedNotes !== up?.notes) {
    setSyncedNotes(up?.notes);
    setNotes(up?.notes ?? "");
  }

  async function patch(p: Parameters<typeof store.updateUserProduct>[1], msg?: string) {
    try {
      await store.updateUserProduct(product.id, p);
      if (msg) toast(msg);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  if (loading && up === undefined) return <Loading />;
  return (
    <section className="mt-5 rounded-3xl card bg-paper p-5" aria-labelledby="mine-h">
      <h2 id="mine-h" className="h-display text-xl font-semibold">
        Your take
      </h2>
      <div className="mt-3">
        <QuickTrack product={product} userProduct={up ?? null} />
      </div>

      {up?.status === "tried" && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-cream p-3">
          {up.score != null ? <ScoreBadge score={up.score} size="lg" /> : <span className="text-[15px] text-ink-soft">Not scored yet</span>}
          <div className="min-w-0 flex-1 text-sm text-ink-soft">
            {up.score != null ? "Your score, from where it sits among everything you've tried." : "A few quick comparisons turn your opinion into a 1–10 score."}
          </div>
          <button type="button" className={up.score != null ? btn.secondary : btn.primary} onClick={() => setScoring(true)}>
            {up.score != null ? "Re-score" : "Score it"}
          </button>
        </div>
      )}
      {scoring && <ScoreFlow product={product} onClose={() => setScoring(false)} />}

      {up?.status === "tried" && (
        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-semibold">
              Private notes <span className="font-normal text-ink-soft">— only you can see these</span>
            </label>
            <textarea
              id="notes"
              className={`${input} min-h-24`}
              placeholder="Air fryer, 12 minutes. Half the sauce."
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (up.notes ?? "") && patch({ notes: notes.trim() || null }, "Notes saved")}
            />
          </div>
          {up.firstTriedOn && <p className="text-sm text-ink-soft">First tried {new Date(up.firstTriedOn + "T12:00").toLocaleDateString()}</p>}
        </div>
      )}

      {up && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Your rankings</h3>
          <p className="mb-2 text-sm text-ink-soft">Add it to a ranking and we&apos;ll help you place it with a few quick comparisons.</p>
          <CollectionPicker product={product} />
        </div>
      )}

      {up?.status === "tried" && <ReviewEditor productId={product.id} />}

      {up && (
        <button
          type="button"
          className="mt-6 text-sm text-ink-soft underline"
          onClick={async () => {
            if (!confirm("Remove this product from your list? Your rating and private notes for it will be deleted.")) return;
            await store.untrack(product.id);
            toast("Removed from your list");
          }}
        >
          Remove from my list
        </button>
      )}
    </section>
  );
}

function ReviewEditor({ productId }: { productId: string }) {
  const store = useStore();
  const toast = useToast();
  const { data: review, loading } = useQuery((s) => s.myReview(productId), [productId]);
  const [body, setBody] = useState(review?.body ?? "");
  const [visibility, setVisibility] = useState<Visibility>(review?.visibility ?? "public");
  const [photos, setPhotos] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only reset the draft when the saved review itself changes, not on unrelated store updates.
  const reviewKey = review === undefined ? "loading" : `${review?.id}:${review?.updatedAt}`;
  const [syncedKey, setSyncedKey] = useState(reviewKey);
  if (syncedKey !== reviewKey) {
    setSyncedKey(reviewKey);
    setBody(review?.body ?? "");
    setVisibility(review?.visibility ?? "public");
    setRemoveIds([]);
  }

  const kept = (review?.media ?? []).filter((m) => !removeIds.includes(m.id));
  const remaining = MAX_PHOTOS_PER_REVIEW - kept.length - photos.length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await store.saveReview(productId, { body, visibility, newPhotos: photos, removeMediaIds: removeIds });
      setPhotos([]);
      toast(visibility === "public" ? "Review published" : "Review saved privately");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && review === undefined) return null;
  return (
    <form id="review" onSubmit={save} className="mt-6 scroll-mt-20 border-t border-line pt-5">
      <h3 className="h-display text-lg font-semibold">{review ? "Your review" : "Write a review"}</h3>
      <label htmlFor="review-body" className="sr-only">
        Review
      </label>
      <textarea
        id="review-body"
        className={`${input} mt-2 min-h-28`}
        placeholder="What did you think? How did you prepare it?"
        value={body}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {kept.map((m) => (
          <div key={m.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt="Your review photo" className="h-20 w-20 rounded-xl object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => setRemoveIds((r) => [...r, m.id])} className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-ink text-white">
              ×
            </button>
          </div>
        ))}
        {photos.map((f, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(f)} alt="New photo to upload" className="h-20 w-20 rounded-xl object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-ink text-white">
              ×
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line text-xs text-ink-soft hover:bg-crust">
            <span className="text-2xl" aria-hidden>
              +
            </span>
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              multiple
              onChange={(e) => {
                setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS_PER_REVIEW - kept.length));
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Who can see it</legend>
        <div className="mt-1 flex gap-2">
          {(["public", "private"] as const).map((v) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold ${visibility === v ? "border-ink bg-ink text-white" : "border-line"}`}>
              <input type="radio" name="vis" value={v} checked={visibility === v} onChange={() => setVisibility(v)} className="sr-only" />
              {v === "public" ? "Public" : "Only me"}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <div className="mt-3"><ErrorState message={error} /></div>}
      <div className="mt-4 flex gap-2">
        <button className={btn.primary} disabled={busy}>
          {busy ? "Saving…" : review ? "Update review" : "Save review"}
        </button>
        {review && (
          <button
            type="button"
            className={btn.ghost}
            onClick={async () => {
              if (!confirm("Delete your review and its photos?")) return;
              await store.deleteReview(productId);
              toast("Review deleted");
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function PublicCollections({ product }: { product: Product }) {
  const productId = product.id;
  const { data } = useQuery((s) => s.publicCollectionsForProduct(product.slug), [product.slug]);
  if (!data?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="h-display text-xl font-semibold">In public rankings</h2>
      <ul className="mt-3 space-y-2">
        {data.map((c) => {
          const pos = c.items.findIndex((i) => i.productId === productId) + 1;
          return (
            <li key={c.id}>
              <Link href={`/collections/${c.id}`} className="flex items-center justify-between rounded-2xl card bg-paper px-4 py-3 hover:bg-crust">
                <span>
                  <span className="font-semibold">{c.title}</span>
                  <span className="block text-sm text-ink-soft">by {c.owner.displayName}</span>
                </span>
                <span className="h-display text-lg font-bold text-tomato">
                  #{pos}
                  <span className="text-sm font-normal text-ink-soft"> of {c.items.length}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CommunityReviews({ slug }: { slug: string }) {
  const { data, loading, error } = useQuery((s) => s.publicReviewsForProduct(slug), [slug]);
  return (
    <section className="mt-8">
      <h2 className="h-display text-xl font-semibold">Community reviews</h2>
      {error ? (
        <ErrorState message={error} />
      ) : loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <p className="mt-2 text-ink-soft">No public reviews yet. Tried it? Yours could be the first.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((r) => (
            <li key={r.id} className="rounded-3xl card bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ProfileLink profile={r.author} />
                <span className="text-xs text-ink-soft">{timeAgo(r.updatedAt)}</span>
              </div>
              {r.body && <p className="mt-2 whitespace-pre-line">{r.body}</p>}
              {r.media.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {r.media.map((m) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={m.id} src={m.url} alt={`Photo by ${r.author.displayName}`} className="h-32 w-32 shrink-0 rounded-2xl object-cover" />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommunityScore({ slug }: { slug: string }) {
  const { data } = useQuery((s) => s.scoreStats(slug), [slug]);
  if (!data) return null;
  if (!data.count) return <p className="mt-2 text-sm text-ink-soft">No shared scores yet.</p>;
  return (
    <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
      <ScoreBadge score={data.average!} /> community score from {data.count} {data.count === 1 ? "person who shares" : "people who share"} their scores
    </p>
  );
}

function Comments({ slug }: { slug: string }) {
  const store = useStore();
  const toast = useToast();
  const userId = useCurrentUserId();
  const { data, loading, error } = useQuery((s) => s.productComments(slug), [slug]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ProductComment | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await store.addComment(slug, body.trim(), replyTo?.id ?? null);
      setBody("");
      setReplyTo(null);
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const top = (data ?? []).filter((c) => !c.parentId);
  const replies = (id: string) => (data ?? []).filter((c) => c.parentId === id);

  const item = (c: ProductComment, nested = false) => (
    <li key={c.id} className={nested ? "ml-8 mt-2" : ""}>
      <div className="rounded-2xl bg-paper p-3 card">
        <div className="flex items-center justify-between gap-2 text-sm">
          <ProfileLink profile={c.author} />
          <span className="text-xs text-ink-soft">{timeAgo(c.createdAt)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-line text-[15px]">{c.body}</p>
        <div className="mt-1 flex gap-3 text-[13px] font-semibold text-ink-soft">
          {userId && !nested && (
            <button type="button" onClick={() => setReplyTo(c)} className="hover:text-ink">
              Reply
            </button>
          )}
          {userId === c.author.id && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Delete this comment?")) return;
                await store.deleteComment(c.id).catch((e) => toast(errMsg(e), "error"));
              }}
              className="hover:text-tomato-dark"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {!nested && replies(c.id).length > 0 && <ul>{replies(c.id).map((r) => item(r, true))}</ul>}
    </li>
  );

  return (
    <section className="mt-8" aria-labelledby="comments-h">
      <h2 id="comments-h" className="h-display text-xl font-semibold">
        Comments
      </h2>
      {error ? (
        <ErrorState message={error} />
      ) : loading && !data ? (
        <Loading />
      ) : top.length === 0 ? (
        <p className="mt-2 text-ink-soft">No comments yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">{top.map((c) => item(c))}</ul>
      )}
      {userId ? (
        <form onSubmit={submit} className="mt-4">
          {replyTo && (
            <p className="mb-1 text-sm text-ink-soft">
              Replying to {replyTo.author.displayName} ·{" "}
              <button type="button" className="underline" onClick={() => setReplyTo(null)}>
                cancel
              </button>
            </p>
          )}
          <label htmlFor="comment-body" className="sr-only">
            Add a comment
          </label>
          <div className="flex gap-2">
            <input id="comment-body" className={input} placeholder="Add a comment" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
            <button className={btn.primary} disabled={busy || !body.trim()}>
              Post
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          <Link href={`/login?next=/products/${slug}`} className="font-semibold text-tomato underline">
            Sign in
          </Link>{" "}
          to comment.
        </p>
      )}
    </section>
  );
}
