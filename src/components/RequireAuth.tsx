"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUserId } from "@/lib/data/provider";
import { btn, EmptyState } from "./ui";

export function RequireAuth({ children, title = "Sign in to see your list" }: { children: React.ReactNode; title?: string }) {
  const userId = useCurrentUserId();
  const path = usePathname();
  if (userId) return <>{children}</>;
  return (
    <EmptyState title={title} action={<Link href={`/login?next=${encodeURIComponent(path)}`} className={btn.primary}>Sign in or create an account</Link>}>
      Your tried list, want-to-try list and rankings live here.
    </EmptyState>
  );
}
