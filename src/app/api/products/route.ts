import { getViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { listProducts } from "@/server/repo";

export const GET = handler(async (req) => {
  await getViewer(); // per-request (reads cookies); browsing is open to everyone
  const p = req.nextUrl.searchParams;
  return listProducts(p.get("q"), p.get("category"));
});
