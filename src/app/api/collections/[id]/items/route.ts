import { requireViewer } from "@/server/auth";
import { handler, readJson, str } from "@/server/http";
import { addToCollection } from "@/server/repo";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const v = await requireViewer();
  const b = await readJson<{ productId?: unknown }>(req);
  return addToCollection(v, (await params).id, str(b.productId, "productId", { min: 1, max: 100 })!);
});
