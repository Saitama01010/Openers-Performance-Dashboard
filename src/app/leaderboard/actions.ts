"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { invalidateLeaderboardSourceCache } from "@/leaderboard/transfers";

export async function refreshLeaderboardSources() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  invalidateLeaderboardSourceCache();
  revalidatePath("/leaderboard");
}
