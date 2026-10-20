import { requireViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { clearScore } from "@/server/repo";

/** Remove a product from your scored ranking (keeps it as tried). */
export const DELETE = handler(async (_req, { params }: { params: Promise<{ productId: string }> }) =>
  clearScore(await requireViewer(), (await params).productId),
);
