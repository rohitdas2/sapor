import { getViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { publicCollectionsByUser } from "@/server/repo";

export const GET = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  await getViewer();
  return publicCollectionsByUser((await params).id);
});
