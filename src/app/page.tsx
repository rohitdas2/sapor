"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState, ErrorState, input, Loading, Stars } from "@/components/ui";
import { useQuery } from "@/lib/data/provider";
import { CATEGORIES, type CategoryId } from "@/lib/types";

export default function DiscoverPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const filtering = q.trim() !== "" || category !== null;

  const products = useQuery((s) => s.listProducts({ q, category }), [q, category]);
  const mine = useQuery((s) => s.myUserProducts(), []);
  const newest = useQuery((s) => s.newAdditions(6), []);
  const favorites = useQuery((s) => s.communityFavorites(6), []);
  const byId = useMemo(() => new Map((mine.data ?? []).map((u) => [u.productId, u])), [mine.data]);

  return (
    <div>
      <section className="mb-6">
        <h1 className="h-display text-3xl font-bold leading-tight md:text-4xl">What are you tasting next?</h1>
        <p className="mt-1 text-ink-soft">Track, rate and rank Trader Joe&apos;s finds. Build a collection of your taste.</p>
        <div className="mt-4">
          <label htmlFor="search" className="sr-only">
            Search products
          </label>
          <input
            id="search"
            type="search"
            className={`${input} rounded-full`}
            placeholder="Search dumplings, cookie butter, sparkling water…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by category">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            All
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </section>

      {!filtering && (
        <>
          <Section title="Community favorites" note="Rated 4★+ on average by at least two people who chose to share their ratings.">
            {favorites.loading && !favorites.data ? (
              <Loading />
            ) : favorites.data?.length ? (
              <Grid>
                {favorites.data.map(({ product, stats }) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    userProduct={byId.get(product.id) ?? null}
                    extra={
                      <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
                        <Stars value={stats.average!} size="text-sm" /> {stats.average!.toFixed(1)} · {stats.count} ratings
                      </p>
                    }
                  />
                ))}
              </Grid>
            ) : (
              <EmptyState title="No community favorites yet">
                Favorites show up here once people share their ratings. Rate what you&apos;ve tried and tick
                &ldquo;share my rating&rdquo; to help.
              </EmptyState>
            )}
          </Section>

          <Section title="New to the catalog" note="Most recently added to Sapor's catalog — not a claim about what's new in stores.">
            {newest.data ? (
              <Grid>
                {newest.data.map((p) => (
                  <ProductCard key={p.id} product={p} userProduct={byId.get(p.id) ?? null} />
                ))}
              </Grid>
            ) : (
              <Loading />
            )}
          </Section>
        </>
      )}

      <Section title={filtering ? "Results" : "All products"}>
        {products.error ? (
          <ErrorState message={products.error} />
        ) : !products.data ? (
          <Loading />
        ) : products.data.length === 0 ? (
          <EmptyState title="Nothing matches that">
            Try a different word or category. The starter catalog is small for now.
          </EmptyState>
        ) : (
          <Grid>
            {products.data.map((p) => (
              <ProductCard key={p.id} product={p} userProduct={byId.get(p.id) ?? null} />
            ))}
          </Grid>
        )}
      </Section>

      <p className="mt-8 text-sm text-ink-soft">
        Can&apos;t find something? The catalog is curated by Sapor admins for now.{" "}
        <Link href="/about" className="underline">
          About the catalog
        </Link>
      </p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${active ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:bg-crust"}`}
    >
      {children}
    </button>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="h-display text-2xl font-semibold">{title}</h2>
      {note && <p className="mb-3 mt-0.5 text-sm text-ink-soft">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">{children}</div>;
}
