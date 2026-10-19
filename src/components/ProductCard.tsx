"use client";

import Link from "next/link";
import type { Product, UserProduct } from "@/lib/types";
import { QuickTrack } from "./TrackControls";
import { AvailabilityBadge, categoryLabel, ProductImage } from "./ui";

export function ProductCard({ product, userProduct, extra }: { product: Product; userProduct: UserProduct | null; extra?: React.ReactNode }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl card bg-paper">
      <Link href={`/products/${product.slug}`} className="group block">
        <ProductImage product={product} className="aspect-square w-full transition group-hover:scale-[1.02]" />
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink-soft">
            {categoryLabel(product.category)} <AvailabilityBadge product={product} />
          </div>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug tracking-tight">{product.name}</h3>
          {extra}
        </div>
      </Link>
      <div className="mt-auto p-3 pt-3">
        <QuickTrack product={product} userProduct={userProduct} compact />
      </div>
    </article>
  );
}
