import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db, now, transaction, uuid } from "./db";
import { badRequest, unauthorized, ApiError } from "./http";
import { DUMMY_HASH_PROMISE, hashPassword, MIN_PASSWORD_LENGTH, needsRehash, verifyPassword } from "./password";

const COOKIE = "sapor_session";
const SESSION_DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface Viewer {
  id: string;
  role: "user" | "admin";
}

/** The signed-in user for this request, or null for anonymous browsing. */
export async function getViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare("SELECT u.id, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?")
    .get(sha256(token)) as { id: string; role: Viewer["role"]; expires_at: string } | undefined;
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, role: row.role };
}

/** Anonymous visitors can browse; every write goes through this. */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw unauthorized();
  return v;
}

async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db().prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha256(token), userId, now(), expires.toISOString());
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now()); // housekeeping
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

// ---- simple in-memory brute-force throttle (per email). Swap for Redis when running >1 instance.
const attempts = new Map<string, { count: number; until: number }>();
function throttle(key: string) {
  const a = attempts.get(key);
  if (a && a.count >= 5 && a.until > Date.now()) throw new ApiError(429, "Too many attempts. Try again in a few minutes.");
}
function recordFailure(key: string) {
  const a = attempts.get(key);
  const fresh = !a || a.until < Date.now();
  attempts.set(key, { count: fresh ? 1 : a.count + 1, until: Date.now() + 10 * 60_000 });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(input: { email: unknown; password: unknown; displayName: unknown }) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!EMAIL.test(email) || email.length > 254) throw badRequest("Enter a valid email address.");
  if (password.length < MIN_PASSWORD_LENGTH) throw badRequest(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
  if (password.length > 200) throw badRequest("That password is too long.");
  if (!displayName || displayName.length > 40) throw badRequest("Pick a display name (up to 40 characters).");

  const hash = await hashPassword(password);
  const id = uuid();
  try {
    transaction(() => {
      db().prepare("INSERT INTO users (id, email, password, created_at) VALUES (?, ?, ?, ?)").run(id, email, hash, now());
      db().prepare("INSERT INTO profiles (user_id, display_name, created_at) VALUES (?, ?, ?)").run(id, displayName, now());
    });
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new ApiError(409, "An account with that email already exists. Sign in instead.");
    throw e;
  }
  await startSession(id);
  return { id };
}

export async function signIn(input: { email: unknown; password: unknown }) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  throttle(email);
  const user = db().prepare("SELECT id, password FROM users WHERE email = ?").get(email) as { id: string; password: string } | undefined;
  // Verify against a dummy hash when the user doesn't exist so timing doesn't reveal which emails are registered.
  const ok = await verifyPassword(password, user?.password ?? (await DUMMY_HASH_PROMISE));
  if (!user || !ok) {
    recordFailure(email);
    throw new ApiError(401, "Email or password is incorrect.");
  }
  attempts.delete(email);
  if (needsRehash(user.password)) {
    db().prepare("UPDATE users SET password = ? WHERE id = ?").run(await hashPassword(password), user.id);
  }
  await startSession(user.id);
  return { id: user.id };
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
  store.delete(COOKIE);
}
