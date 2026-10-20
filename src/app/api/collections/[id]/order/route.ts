import { requireViewer } from "@/server/auth";
import { handler, readJson } from "@/server/http";
import { saveCollectionOrder } from "@/server/repo";

export const PUT = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const v = await requireViewer();
  const { order } = await readJson<{ order: unknown }>(req);
  saveCollectionOrder(v, (await params).id, order);
});
