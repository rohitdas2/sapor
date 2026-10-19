"use client";

import { ProfileView } from "@/components/ProfileView";
import { RequireAuth } from "@/components/RequireAuth";
import { useCurrentUserId } from "@/lib/data/provider";

export default function MyProfilePage() {
  const me = useCurrentUserId();
  return <RequireAuth title="Sign in to see your profile">{me && <ProfileView userId={me} />}</RequireAuth>;
}
