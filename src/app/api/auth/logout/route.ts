import { signOut } from "@/server/auth";
import { handler } from "@/server/http";

export const POST = handler(async () => signOut());
