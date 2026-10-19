"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { CATEGORIES, type CategoryId, type Product } from "@/lib/types";

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-tomato px-5 font-semibold text-white hover:bg-tomato-dark disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 font-semibold text-ink hover:bg-crust disabled:opacity-50",
  ghost: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-medium text-ink-soft hover:bg-crust",
};

export const input =
  "w-full rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:border-saffron";

const CATEGORY_STYLE: Record<CategoryId, { bg: string; glyph: string }> = {
  "frozen-meals": { bg: "linear-gradient(135deg,#dbe9f2,#b9d3e6)", glyph: "❄︎" },
  snacks: { bg: "linear-gradient(135deg,#fbe3b8,#f3c77c)", glyph: "◐" },
  desserts: { bg: "linear-gradient(135deg,#f6d6d6,#e9aeb1)", glyph: "✿" },
  sauces: { bg: "linear-gradient(135deg,#f8d2bf,#e79a76)", glyph: "◉" },
  bakery: { bg: "linear-gradient(135deg,#f1e0c5,#d9b98a)", glyph: "◠" },
  drinks: { bg: "linear-gradient(135deg,#d8ecdf,#a9d1b6)", glyph: "◌" },
};

export function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function ProductImage({ product, className = "" }: { product: Product; className?: string }) {
  if (product.imageUrl && !product.imageIsPlaceholder) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.imageUrl} alt={product.name} className={`object-cover ${className}`} />;
  }
  const s = CATEGORY_STYLE[product.category];
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: s.bg }}
      role="img"
      aria-label={`Placeholder image for ${product.name}`}
    >
      <span aria-hidden className="text-5xl text-white/80 drop-shadow-sm">
        {s.glyph}
      </span>
      <span className="absolute bottom-1.5 right-2 rounded bg-white/70 px-1.5 text-[10px] font-medium text-ink-soft">
        Placeholder image
      </span>
    </div>
  );
}

export function AvailabilityBadge({ product }: { product: Product }) {
  if (product.availability === "seasonal")
    return <span className="rounded-full bg-saffron-soft px-2.5 py-0.5 text-xs font-semibold text-[#7a5300]">Seasonal</span>;
  if (product.availability === "discontinued")
    return <span className="rounded-full bg-crust px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Discontinued</span>;
  return null;
}

export function Stars({ value, size = "text-base" }: { value: number; size?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`text-saffron ${size}`} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden>
          {rounded >= i ? "★" : rounded >= i - 0.5 ? "⯪" : "☆"}
        </span>
      ))}
    </span>
  );
}

/** 1–5 rating input. Tapping the current value again clears it. */
export function RatingInput({ value, onChange, label = "Your rating" }: { value: number | null; onChange: (v: number | null) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          onClick={() => onChange(value === i ? null : i)}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-3xl leading-none transition hover:scale-110 ${
            value != null && i <= value ? "text-saffron" : "text-line"
          }`}
        >
          ★
        </button>
      ))}
      {value != null && (
        <button type="button" onClick={() => onChange(null)} className="ml-1 text-sm text-ink-soft underline">
          Clear
        </button>
      )}
    </div>
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
