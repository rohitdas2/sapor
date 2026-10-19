"use client";

import { useEffect } from "react";

const PERMALINK = /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?$/;

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

/**
 * Official Instagram embed: the post stays hosted by Instagram, credited and
 * linked to its author. Nothing is downloaded or copied into Sapor.
 */
export function InstagramEmbed({ url }: { url: string }) {
  const valid = PERMALINK.test(url);

  useEffect(() => {
    if (!valid) return;
    if (window.instgrm) {
      window.instgrm.Embeds.process();
      return;
    }
    if (!document.getElementById("instagram-embed-js")) {
      const s = document.createElement("script");
      s.id = "instagram-embed-js";
      s.async = true;
      s.src = "https://www.instagram.com/embed.js";
      document.body.appendChild(s);
    }
  }, [url, valid]);

  if (!valid) return null;
  return (
    <section className="mt-8" aria-labelledby="ig-h">
      <h2 id="ig-h" className="h-display text-xl font-semibold">
        On Instagram
      </h2>
      <p className="mb-3 text-[13px] text-ink-soft">Embedded from Instagram. Loading it shares your visit with Instagram.</p>
      <blockquote className="instagram-media" data-instgrm-permalink={url} data-instgrm-version="14" style={{ margin: 0, maxWidth: 540, width: "100%" }}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          View this post on Instagram
        </a>
      </blockquote>
    </section>
  );
}
