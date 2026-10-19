"use client";

import { useParams } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <ProfileView userId={id} />;
}
