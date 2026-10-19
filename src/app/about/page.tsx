"use client";

import { DemoControls } from "@/components/DemoControls";
import { useStore } from "@/lib/data/provider";

export default function AboutPage() {
  const store = useStore();
  return (
    <div className="mx-auto max-w-2xl space-y-6 leading-relaxed">
      <h1 className="h-display text-3xl font-bold">About Sapor</h1>
      <p>
        Sapor is an <strong>independent community app</strong> for keeping track of the grocery products you want to try,
        the ones you&apos;ve tried, and how they rank against each other. It is <strong>not affiliated with, endorsed by, or
        sponsored by Trader Joe&apos;s</strong>. Product names are used only to identify products.
      </p>

      <section>
        <h2 className="h-display text-xl font-semibold">The catalog</h2>
        <p className="mt-1">
          The starter catalog is a small, hand-curated list of well-known products with short general descriptions. Sapor
          does not show prices or store stock. &ldquo;Seasonal&rdquo; means a product is generally known to be a seasonal
          release, not that it&apos;s on shelves now. Product images are emoji illustrations until permitted product photos are added.
        </p>
      </section>

      <section>
        <h2 className="h-display text-xl font-semibold">How ranking works</h2>
        <p className="mt-1">
          Sapor doesn&apos;t use star ratings. When you add something you tried to a ranking, it asks a few quick
          &ldquo;which did you prefer?&rdquo; questions to find its spot. Ties are fine, and you can always skip or adjust by hand.
          Each ranking is independent, so reordering one never touches another.
        </p>
      </section>

      <section>
        <h2 className="h-display text-xl font-semibold">Privacy</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Your tried and want-to-try lists and your notes are private.</li>
          <li>Reviews and rankings are private until you choose to make them public.</li>
          <li>Community favorites come only from rankings people chose to make public.</li>
        </ul>
      </section>

      {store.mode === "local-demo" && (
        <section className="rounded-3xl bg-crust p-5">
          <h2 className="h-display text-xl font-semibold">You&apos;re using the local demo</h2>
          <p className="mt-1">
            Everything is saved in this browser&apos;s storage. Accounts aren&apos;t password-protected, shared links only open
            in this browser, and clearing site data erases it all. The production version uses Supabase for real accounts, a
            shared database with row-level security, and photo storage.
          </p>
          <div className="mt-4">
            <DemoControls />
          </div>
        </section>
      )}
    </div>
  );
}
