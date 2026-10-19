"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUserId, useStore } from "@/lib/data/provider";
import { ToastProvider } from "./ui";

const NAV = [
  { href: "/", label: "Discover", icon: "M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" },
  { href: "/me", label: "My list", icon: "M5 4h14v2H5V4Zm0 7h14v2H5v-2Zm0 7h9v2H5v-2Z" },
  { href: "/community", label: "Community", icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-3 3-5 6-5s6 2 6 5H2Zm12.5 0c0-1.7-.7-3.2-1.9-4.3.9-.4 2-.7 3.4-.7 3 0 6 2 6 5h-7.5Z" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c0-3.3 3.6-6 8-6s8 2.7 8 6H4Z" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/products");
  if (href === "/me") return path.startsWith("/me") || path.startsWith("/collections");
  if (href === "/profile") return path.startsWith("/profile") || path.startsWith("/u/");
  return path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const store = useStore();
  const userId = useCurrentUserId();

  return (
    <ToastProvider>
      {store.mode === "local-demo" && (
        <div className="bg-ink px-4 py-1.5 text-center text-xs text-white/90">
          <strong>Local demo</strong> — data is saved only in this browser.{" "}
          <Link href="/about" className="underline">
            What this means
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="h-display text-2xl font-bold text-tomato" aria-label="Sapor home">
            sapor<span className="text-saffron">.</span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(path, n.href) ? "page" : undefined}
                className={`rounded-full px-4 py-2 font-medium ${isActive(path, n.href) ? "bg-ink text-white" : "text-ink-soft hover:bg-crust"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          {!userId && (
            <Link href="/login" className="rounded-full bg-tomato px-4 py-2 text-sm font-semibold text-white md:ml-2">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-5 md:pb-16">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pb-28 text-xs text-ink-soft md:pb-8">
        Sapor is an independent community app. It is not affiliated with, endorsed by, or sponsored by Trader Joe&apos;s.
        Product names belong to their owners. Sapor does not track prices or store availability.{" "}
        <Link href="/about" className="underline">
          About
        </Link>
      </footer>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? "text-tomato" : "text-ink-soft"}`}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </ToastProvider>
  );
}
