import { getViewer, requireViewer } from "@/server/auth";
import { handler, oneOf, readJson, str } from "@/server/http";
import { deleteCollection, getCollection, updateCollection } from "@/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Public collections are viewable by anyone (shareable links); private ones only by the owner. */
export const GET = handler(async (_req, ctx: Ctx) => getCollection(await getViewer(), (await ctx.params).id));

export const PATCH = handler(async (req, ctx: Ctx) => {
  const v = await requireViewer();
  const b = await readJson<Record<string, unknown>>(req);
  updateCollection(v, (await ctx.params).id, {
    title: b.title === undefined ? undefined : str(b.title, "Title", { min: 1, max: 80 })!,
    description: b.description === undefined ? undefined : str(b.description, "Description", { max: 280, optional: true }),
    visibility: b.visibility === undefined ? undefined : oneOf(b.visibility, "visibility", ["private", "public"] as const),
  });
});

export const DELETE = handler(async (_req, ctx: Ctx) => deleteCollection(await requireViewer(), (await ctx.params).id));
