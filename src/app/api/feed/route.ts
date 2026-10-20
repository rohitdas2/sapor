import { getViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { feed } from "@/server/repo";

export const GET = handler(async (req) => {
  await getViewer();
  const p = req.nextUrl.searchParams;
  return feed(p.get("userId"), Math.min(Number(p.get("limit")) || 40, 100));
});
