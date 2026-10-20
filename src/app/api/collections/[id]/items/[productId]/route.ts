import { requireViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { removeFromCollection } from "@/server/repo";

export const DELETE = handler(async (_req, { params }: { params: Promise<{ id: string; productId: string }> }) => {
  const { id, productId } = await params;
  removeFromCollection(await requireViewer(), id, productId);
});
