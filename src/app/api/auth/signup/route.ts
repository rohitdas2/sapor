import { signUp } from "@/server/auth";
import { handler, readJson } from "@/server/http";

export const POST = handler(async (req) => signUp(await readJson(req)));
