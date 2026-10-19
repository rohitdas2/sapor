"use client";

import { Feed, FeedEmpty } from "@/components/Feed";
import { DemoControls } from "@/components/DemoControls";

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="h-display text-3xl font-bold">Community</h1>
      <p className="mt-1 text-ink-soft">Public reviews and shared rankings, newest first.</p>
      <div className="mt-5">
        <Feed
          empty={
            <FeedEmpty>
              When people publish a review or make a ranking public, it shows up here. Nothing here is invented.
              <div className="mt-4">
                <DemoControls />
              </div>
            </FeedEmpty>
          }
        />
      </div>
    </div>
  );
}
