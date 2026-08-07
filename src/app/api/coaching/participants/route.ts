import { getCurrentUser } from "@/auth/session";
import { getCoachingParticipantPage } from "@/coaching/data";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return privateJson({ message: "Unauthorized" }, 401);
  if (actor.role === "agent") return privateJson({ message: "Forbidden" }, 403);

  const url = new URL(request.url);
  const coachProfileId = url.searchParams.get("coach")?.trim() || actor.id;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const search = url.searchParams.get("q")?.slice(0, 120) ?? "";
  const data = await getCoachingParticipantPage(actor, {
    coachProfileId,
    page,
    pageSize: 12,
    search,
  });
  return privateJson(data);
}
