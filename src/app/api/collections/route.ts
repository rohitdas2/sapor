import { requireViewer } from "@/server/auth";
import { handler, oneOf, readJson, str } from "@/server/http";
import { createCollection, myCollections } from "@/server/repo";

export const GET = handler(async () => myCollections(await requireViewer()));

export const POST = handler(async (req) => {
  const v = await requireViewer();
  const b = await readJson<Record<string, unknown>>(req);
  return createCollection(v, {
    title: str(b.title, "Title", { min: 1, max: 80 })!,
    description: str(b.description, "Description", { max: 280, optional: true }),
    visibility: oneOf(b.visibility ?? "private", "visibility", ["private", "public"] as const),
  });
});
