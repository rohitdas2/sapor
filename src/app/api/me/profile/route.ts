import { requireViewer } from "@/server/auth";
import { badRequest, handler, readJson, str } from "@/server/http";
import { updateMyProfile } from "@/server/repo";

export const PATCH = handler(async (req) => {
  const v = await requireViewer();
  const b = await readJson<Record<string, unknown>>(req);
  if (b.shareScores !== undefined && typeof b.shareScores !== "boolean") throw badRequest("shareScores must be true or false.");
  updateMyProfile(v, {
    displayName: b.displayName === undefined ? undefined : str(b.displayName, "Display name", { min: 1, max: 40 })!,
    bio: b.bio === undefined ? undefined : str(b.bio, "Bio", { max: 160, optional: true }),
    pinnedCollectionId: b.pinnedCollectionId === undefined ? undefined : typeof b.pinnedCollectionId === "string" ? b.pinnedCollectionId : null,
    shareScores: b.shareScores as boolean | undefined,
  });
});
