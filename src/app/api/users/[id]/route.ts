import { getViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { getProfile } from "@/server/repo";

export const GET = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => getProfile(await getViewer(), (await params).id));
