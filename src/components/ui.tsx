"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { CATEGORIES, type CategoryId, type Product } from "@/lib/types";

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-tomato px-5 font-semibold text-white hover:bg-tomato-dark disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink/[0.06] px-5 font-semibold text-ink hover:bg-ink/10 disabled:opacity-50",
  ghost: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-medium text-ink-soft hover:bg-crust",
};

export const input =
  "w-full rounded-xl bg-ink/[0.05] px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 outline-none focus:bg-paper focus:ring-2 focus:ring-tomato/40";

const CATEGORY_BG: Record<CategoryId, string> = {
  "frozen-meals": "linear-gradient(160deg,#eef4f8,#dde9f1)",
  snacks: "linear-gradient(160deg,#fdf4e3,#f8e6c4)",
  desserts: "linear-gradient(160deg,#fbeeee,#f4dcdd)",
  sauces: "linear-gradient(160deg,#fcefe8,#f6dccd)",
  bakery: "linear-gradient(160deg,#f8f0e4,#efe0c8)",
  drinks: "linear-gradient(160deg,#eef6f0,#dcece1)",
};

export function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function ProductImage({ product, className = "" }: { product: Product; className?: string }) {
  if (product.imageUrl && !product.imageIsPlaceholder) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.imageUrl} alt={product.name} className={`object-cover ${className}`} />;
  }
  if (product.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.photo.url}
        alt={`Representative photo for ${product.name} (not the actual product)`}
        loading="lazy"
        className={`object-cover ${className}`}
        style={{ background: CATEGORY_BG[product.category] }}
      />
    );
  }
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: CATEGORY_BG[product.category], containerType: "size" }}
      role="img"
      aria-label={`Illustration of ${product.name}`}
    >
      <span aria-hidden className="select-none leading-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.12)]" style={{ fontSize: "min(52cqw, 52cqh)" }}>
        {product.emoji ?? "🛒"}
      </span>
    </div>
  );
}

export function PhotoCredit({ product }: { product: Product }) {
  if (!product.photo) return null;
  return (
    <p className="mt-2 text-[12px] text-ink-soft">
      Representative photo, not the actual product · {product.photo.credit} ·{" "}
      <a href={product.photo.source} target="_blank" rel="noopener noreferrer" className="underline">
        {product.photo.license}, Wikimedia Commons
      </a>
    </p>
  );
}

export function AvailabilityBadge({ product }: { product: Product }) {
  if (product.availability === "seasonal")
    return <span className="rounded-full bg-saffron-soft px-2.5 py-0.5 text-xs font-semibold text-[#7a5300]">Seasonal</span>;
  if (product.availability === "discontinued")
    return <span className="rounded-full bg-crust px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Discontinued</span>;
  return null;
}

/** A 1–10 score, one decimal. Color follows the tier band. */
export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const tone = score >= 7 ? "bg-basil text-white" : score >= 4 ? "bg-saffron-soft text-[#6b4800]" : "bg-crust text-ink-soft";
  const dims = size === "lg" ? "h-14 min-w-14 text-2xl" : size === "sm" ? "h-6 min-w-9 text-[13px]" : "h-9 min-w-12 text-base";
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2 font-semibold tabular-nums ${tone} ${dims}`} aria-label={`Score ${score.toFixed(1)} out of 10`}>
      {score.toFixed(1)}
    </span>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-ink-soft">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-tomato" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-tomato/30 bg-tomato/5 p-4 text-tomato-dark">
      {message}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-paper/60 px-6 py-10 text-center">
      <p className="h-display text-xl font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.replace(/^Demo · /, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-crust font-semibold text-tomato-dark"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function DemoBadge() {
  return <span className="rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Demo data</span>;
}

export function ProfileLink({ profile }: { profile: { id: string; displayName: string; avatarUrl: string | null; isDemo: boolean } }) {
  return (
    <Link href={`/u/${profile.id}`} className="inline-flex items-center gap-2 font-semibold hover:underline">
      <Avatar name={profile.displayName} url={profile.avatarUrl} size={28} />
      {profile.displayName}
      {profile.isDemo && <DemoBadge />}
    </Link>
  );
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------- toasts ----------
const ToastCtx = createContext<(msg: string, tone?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: "ok" | "error" }[]>([]);
  const push = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-full px-5 py-3 text-sm font-semibold shadow-lg ${t.tone === "error" ? "bg-tomato-dark text-white" : "bg-ink text-white"}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}
