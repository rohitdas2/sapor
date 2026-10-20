import { getViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { getProfile } from "@/server/repo";

/** Who is browsing. `user: null` = anonymous (can browse, can't write). */
export const GET = handler(async () => {
  const v = await getViewer();
  return { user: v ? { id: v.id, role: v.role, profile: getProfile(v, v.id) } : null };
});
