import { getViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { communityFavorites, newAdditions, topRated } from "@/server/repo";

export const GET = handler(async () => {
  await getViewer();
  return { newAdditions: newAdditions(6), favorites: communityFavorites(6), topRated: topRated(6) };
});
