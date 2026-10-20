"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { btn, errMsg, ErrorState, input } from "@/components/ui";
import { useStore } from "@/lib/data/provider";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") && !params.get("next")?.startsWith("//") ? params.get("next")! : "/me";
  const [mode, setMode] = useState<"signup" | "signin">(params.get("mode") === "signin" ? "signin" : "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await store.signUp({ email, password, displayName: name });
      else await store.signIn({ email, password });
      router.push(next);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="h-display text-3xl font-bold">{mode === "signup" ? "Start your taste log" : "Welcome back"}</h1>
      <p className="mt-1 text-ink-soft">
        {mode === "signup"
          ? "An account lets you save, score, rank, review and comment. Browsing stays open to everyone."
          : "Sign in to pick up where you left off."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "signup" && (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-semibold">
              Display name
            </label>
            <input id="name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={40} required />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-semibold">
            Email
          </label>
          <input id="email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
          {mode === "signup" && <p className="mt-1 text-xs text-ink-soft">At least 8 characters.</p>}
        </div>
        {error && <ErrorState message={error} />}
        <button className={`${btn.primary} w-full`} disabled={busy}>
          {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        className={`${btn.ghost} mt-2 w-full`}
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
        }}
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
      <p className="mt-6 text-center text-sm text-ink-soft">
        <Link href="/" className="underline">
          Keep browsing without an account
        </Link>
      </p>
    </div>
  );
}
