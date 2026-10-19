"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { btn, DemoBadge, errMsg, ErrorState, input } from "@/components/ui";
import { LocalStore } from "@/lib/data/local-store";
import { useCurrentUserId, useStore } from "@/lib/data/provider";

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
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/me";
  const userId = useCurrentUserId();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const local = store instanceof LocalStore ? store : null;

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
      <p className="mt-1 text-ink-soft">Save what you want to try, log what you tried, rank your favorites.</p>

      {local && (
        <p className="mt-4 rounded-2xl bg-saffron-soft p-3 text-sm text-[#5c3f00]">
          <strong>Local demo sign-in.</strong> Accounts are stored only in this browser and no password is checked. Don&apos;t
          use a real password here.
        </p>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
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
        {!local && (
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
              minLength={8}
              required
            />
          </div>
        )}
        {error && <ErrorState message={error} />}
        <button className={`${btn.primary} w-full`} disabled={busy}>
          {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      <button className={`${btn.ghost} mt-2 w-full`} onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>

      {local && local.localAccounts().length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Switch account (this browser)</h2>
          <p className="text-xs text-ink-soft">Handy for checking what other people can and can&apos;t see.</p>
          <ul className="mt-2 space-y-2">
            {local.localAccounts().map((a) => (
              <li key={a.id}>
                <button
                  className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left ${a.id === userId ? "border-basil bg-basil-soft" : "border-line bg-paper hover:bg-crust"}`}
                  onClick={async () => {
                    await local.signIn({ email: a.email, password: "" });
                    router.push(next);
                  }}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {a.displayName} {a.isDemo && <DemoBadge />}
                  </span>
                  <span className="text-xs text-ink-soft">{a.id === userId ? "Signed in" : a.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
