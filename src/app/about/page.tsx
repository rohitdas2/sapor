"use client";


export default function AboutPage() {
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
          release, not that it&apos;s on shelves now. Product photos are freely licensed Wikimedia Commons images of the general food type, credited on each product page. They are not photos of the actual products. Where no suitable photo exists, an emoji illustration is shown.
        </p>
      </section>

      <section>
        <h2 className="h-display text-xl font-semibold">How ranking works</h2>
        <p className="mt-1">
          You never type a number. Tell Sapor whether you loved something, thought it was fine, or didn&apos;t like it, then
          answer a few quick &ldquo;which did you prefer?&rdquo; questions. Its place among everything else you&apos;ve tried
          becomes a 1–10 score (loved items land between 7.0 and 10.0, fine between 4.0 and 6.9, disliked between 1.0 and 3.9).
          Your own rankings like &ldquo;Best desserts&rdquo; work the same way and never change each other.
        </p>
      </section>

      <section>
        <h2 className="h-display text-xl font-semibold">Privacy</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Your tried and want-to-try lists and your notes are private.</li>
          <li>Reviews and rankings are private until you choose to make them public.</li>
          <li>Community favorites come only from rankings people chose to make public.</li>
          <li>Your scores count toward community averages only if you turn on &ldquo;Share my scores&rdquo; on your profile.</li>
          <li>You can browse without an account. Saving, scoring, reviewing and commenting need one.</li>
        </ul>
      </section>

    </div>
  );
}
