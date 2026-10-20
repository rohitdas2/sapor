import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Salted password hashing, stored in a single column as
 *
 *     algorithm$salt$hexdigest      e.g. "scrypt:16384:8:1$9f2c…$a41b…"
 *
 * Same shape as the classic salt + hash scheme, but with scrypt (memory-hard,
 * deliberately slow) instead of one fast SHA-512 round, so a leaked database
 * can't be brute-forced at GPU speed. The cost parameters live in the
 * algorithm field, so they can be raised later without breaking old hashes.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: string, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex"); // unique per user, defeats rainbow tables
  const digest = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return [`scrypt:${N}:${R}:${P}`, salt, digest.toString("hex")].join("$");
}

/** Split on "$", re-hash salt + candidate with the stored algorithm, compare in constant time. */
export async function verifyPassword(candidate: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split("$");
  if (!algorithm || !salt || !hex) return false;
  const [name, n, r, p] = algorithm.split(":");
  if (name !== "scrypt") return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scrypt(candidate.normalize("NFKC"), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when a stored hash uses weaker parameters than today's and should be re-hashed on next login. */
export function needsRehash(stored: string) {
  return stored.split("$")[0] !== `scrypt:${N}:${R}:${P}`;
}

// A real hash of a random password, used to keep login timing the same when the email doesn't exist.
export const DUMMY_HASH_PROMISE = hashPassword(randomBytes(12).toString("hex"));
