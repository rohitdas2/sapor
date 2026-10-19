import { redirect } from "next/navigation";

// Community now lives on Discover.
export default function CommunityPage() {
  redirect("/#community");
}
