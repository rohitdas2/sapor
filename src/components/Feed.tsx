"use client";

import Link from "next/link";
import { useQuery } from "@/lib/data/provider";
import { EmptyState, ErrorState, Loading, ProductImage, ProfileLink, timeAgo } from "./ui";

export function Feed({ userId, empty, limit = 50 }: { userId?: string; empty: React.ReactNode; limit?: number }) {
  const { data, loading, error } = useQuery((s) => s.feed({ userId, limit }), [userId, limit]);
  if (error) return <ErrorState message={error} />;
  if (loading && !data) return <Loading />;
  if (!data?.length) return <>{empty}</>;

  return (
    <ol className="space-y-3">
      {data.map((e) =>
        e.kind === "review" ? (
          <li key={`r-${e.review.id}`} className="rounded-3xl card bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <ProfileLink profile={e.review.author} /> <span className="text-ink-soft">reviewed</span>
              </span>
              <span className="text-xs text-ink-soft">{timeAgo(e.at)}</span>
            </div>
            <Link href={`/products/${e.product.slug}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-cream p-2 hover:bg-crust">
              <ProductImage product={e.product} className="h-12 w-12 shrink-0 rounded-xl" />
              <span className="font-semibold">{e.product.name}</span>
            </Link>
            {e.review.body && <p className="mt-2 whitespace-pre-line">{e.review.body}</p>}
            {e.review.media.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {e.review.media.map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={m.id} src={m.url} alt={`Photo of ${e.product.name}`} className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
                ))}
              </div>
            )}
          </li>
        ) : (
          <li key={`c-${e.collection.id}`} className="rounded-3xl card bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <ProfileLink profile={e.collection.owner} /> <span className="text-ink-soft">shared a ranking</span>
              </span>
              <span className="text-xs text-ink-soft">{timeAgo(e.at)}</span>
            </div>
            <Link href={`/collections/${e.collection.id}`} className="mt-3 block rounded-2xl bg-cream p-3 hover:bg-crust">
              <span className="h-display text-lg font-semibold">{e.collection.title}</span>
              <ol className="mt-1 space-y-0.5 text-sm">
                {e.collection.items.filter((i) => i.position != null).slice(0, 3).map((i, idx) => (
                  <li key={i.productId}>
                    <span className="font-bold text-tomato">{idx + 1}.</span> {i.product.name}
                  </li>
                ))}
              </ol>
              {e.collection.items.length > 3 && <span className="text-sm text-ink-soft">See all {e.collection.items.length} →</span>}
            </Link>
          </li>
        ),
      )}
    </ol>
  );
}

export function FeedEmpty({ children }: { children?: React.ReactNode }) {
  return <EmptyState title="Nothing shared yet">{children}</EmptyState>;
}
