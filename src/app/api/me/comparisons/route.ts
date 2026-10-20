import { requireViewer } from "@/server/auth";
import { handler, readJson } from "@/server/http";
import { recordComparison } from "@/server/repo";

export const POST = handler(async (req) => recordComparison(await requireViewer(), await readJson(req)));
