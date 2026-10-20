import { requireViewer } from "@/server/auth";
import { badRequest, handler, oneOf } from "@/server/http";
import { deleteReview, myReview, saveReview } from "@/server/repo";

type Ctx = { params: Promise<{ productId: string }> };

export const GET = handler(async (_req, ctx: Ctx) => myReview(await requireViewer(), (await ctx.params).productId));

/** multipart/form-data: body, visibility, removeMediaIds (JSON array), photos (files). */
export const PUT = handler(async (req, ctx: Ctx) => {
  const v = await requireViewer();
  const form = await req.formData().catch(() => {
    throw badRequest("Expected form data.");
  });
  const body = String(form.get("body") ?? "").trim();
  if (body.length > 2000) throw badRequest("Reviews are limited to 2,000 characters.");
  let removeMediaIds: string[] = [];
  try {
    removeMediaIds = JSON.parse(String(form.get("removeMediaIds") ?? "[]"));
  } catch {
    throw badRequest("removeMediaIds must be a JSON array.");
  }
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  return saveReview(v, (await ctx.params).productId, {
    body,
    visibility: oneOf(form.get("visibility"), "visibility", ["public", "private"] as const),
    photos,
    removeMediaIds: removeMediaIds.filter((x) => typeof x === "string"),
  });
});

export const DELETE = handler(async (_req, ctx: Ctx) => deleteReview(await requireViewer(), (await ctx.params).productId));
