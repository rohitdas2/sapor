import { requireViewer } from "@/server/auth";
import { handler } from "@/server/http";
import { myUserProducts } from "@/server/repo";

export const GET = handler(async () => myUserProducts(await requireViewer()));
