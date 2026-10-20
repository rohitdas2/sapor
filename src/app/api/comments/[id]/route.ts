import { requireViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { deleteComment } from "@/server/repo";

export const DELETE = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  deleteComment(await requireViewer(), (await params).id);
});
