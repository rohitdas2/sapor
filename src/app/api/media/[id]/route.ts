import { readFileSync } from "node:fs";
import { getViewer } from "@/server/auth";
import { handler, notFound } from "@/server/http";
import { readableMedia } from "@/server/repo";

export const GET = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const m = readableMedia(await getViewer(), (await params).id);
  if (!m) throw notFound();
  return new Response(readFileSync(m.path), {
    headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
});
