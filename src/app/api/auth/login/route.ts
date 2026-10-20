import { signIn } from "@/server/auth";
import { handler, readJson } from "@/server/http";

export const POST = handler(async (req) => signIn(await readJson(req)));
