"use client";

import Link from "next/link";
import type { Product, UserProduct } from "@/lib/types";
import { QuickTrack } from "./TrackControls";
import { AvailabilityBadge, categoryLabel, ProductImage } from "./ui";

export function ProductCard({ product, userProduct, extra }: { product: Product; userProduct: UserProduct | null; extra?: React.ReactNode }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-sm">
      <Link href={`/products/${product.slug}`} className="group block">
        <ProductImage product={product} className="aspect-[4/3] w-full transition group-hover:brightness-95" />
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {categoryLabel(product.category)} <AvailabilityBadge product={product} />
          </div>
          <h3 className="mt-1 font-semibold leading-snug group-hover:underline">{product.name}</h3>
          {extra}
        </div>
      </Link>
      <div className="mt-auto p-3 pt-3">
        <QuickTrack product={product} userProduct={userProduct} compact />
      </div>
    </article>
  );
}
