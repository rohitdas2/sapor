import "server-only";
import { NextResponse, type NextRequest } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new ApiError(400, m);
export const unauthorized = (m = "Sign in to do that.") => new ApiError(401, m);
export const forbidden = (m = "You can't change that.") => new ApiError(403, m);
export const notFound = (m = "Not found.") => new ApiError(404, m);

/**
 * Wrap a route handler: JSON errors, and for writes a same-origin check
 * (CSRF defense in addition to the SameSite=Lax session cookie).
 */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out === undefined ? { ok: true } : out);
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw forbidden("Cross-site request blocked.");
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Expected a JSON body.");
  }
}

export function str(v: unknown, field: string, { max, min = 0, optional = false }: { max: number; min?: number; optional?: boolean }) {
  if (v == null || v === "") {
    if (optional) return null;
    throw badRequest(`${field} is required.`);
  }
  if (typeof v !== "string") throw badRequest(`${field} must be text.`);
  const t = v.trim();
  if (t.length < min) throw badRequest(`${field} is too short.`);
  if (t.length > max) throw badRequest(`${field} must be at most ${max} characters.`);
  return t;
}

export function oneOf<T extends string>(v: unknown, field: string, options: readonly T[]): T {
  if (typeof v !== "string" || !options.includes(v as T)) throw badRequest(`${field} must be one of: ${options.join(", ")}.`);
  return v as T;
}
