import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";

export default async function CoachingIndexPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role === "admin") redirect("/coaching/leaderboard");
  if (actor.role === "manager") redirect("/coaching/room");
  redirect("/flags");
}
