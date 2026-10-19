"use client";

import { useCurrentUserId, useStore } from "@/lib/data/provider";
import { LocalStore } from "@/lib/data/local-store";
import { btn, useToast } from "./ui";

/** Local demo only: opt-in sample community, always labeled as demo data. */
export function DemoControls() {
  const store = useStore();
  const toast = useToast();
  useCurrentUserId(); // re-render on store changes
  if (!(store instanceof LocalStore)) return null;
  const has = store.hasDemoData();
  return (
    <div className="text-sm">
      {has ? (
        <button className={btn.secondary} onClick={() => (store.removeDemoCommunity(), toast("Demo community removed"))}>
          Remove sample community
        </button>
      ) : (
        <>
          <button className={btn.secondary} onClick={() => (store.loadDemoCommunity(), toast("Sample community loaded"))}>
            Load sample community (demo data)
          </button>
          <p className="mt-2 text-xs text-ink-soft">Adds three clearly labeled demo accounts with sample reviews and rankings to this browser only.</p>
        </>
      )}
    </div>
  );
}
