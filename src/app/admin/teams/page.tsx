import { redirect } from "next/navigation";

import { createTeamAction } from "@/admin/actions";
import { listTeams } from "@/admin/data";
import { adminErrorMessage } from "@/admin/messages";
import { getCurrentUser } from "@/auth/session";
import { InlineTeamSelect } from "@/components/admin/inline-user-fields";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "—";
}

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await getCurrentUser();
  const params = await searchParams;

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  const { teams } = await listTeams(actor);
  const activeTeams = teams
    .filter((team) => team.active)
    .map((team) => ({ id: team.id, name: team.name }));
  const members = teams.flatMap((team) =>
    team.members.map((member) => ({
      ...member,
      teamName: team.name,
    })),
  );

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <StatusMessage error={params.error} ok={params.ok} />

      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-muted">Admin only</p>
        <h2 className="text-xl font-semibold">Create a new team</h2>
        <form action={createTeamAction} className="mt-4 flex flex-wrap gap-3">
          <label className="min-w-72 flex-1 text-sm font-medium">
            Team name
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              name="name"
              required
            />
          </label>
          <button className="self-end rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Create team
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Current members</h2>
        </div>
        {members.length === 0 ? (
          <p className="p-5 text-sm text-muted">No current team members.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    className="border-t border-border align-top"
                    key={member.id}
                  >
                    <td className="px-4 py-3 font-medium">
                      {member.profileName}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {member.membershipRole}
                    </td>
                    <td className="px-4 py-3">
                      {member.profileRole === "agent" ||
                      member.profileRole === "manager" ? (
                        <InlineTeamSelect
                          currentTeamId={member.teamId}
                          currentTeamName={member.teamName}
                          teams={activeTeams}
                          userId={member.profileId}
                        />
                      ) : (
                        member.teamName
                      )}
                    </td>
                    <td className="px-4 py-3">{fmt(member.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function StatusMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {adminErrorMessage(error)}
      </p>
    );
  }
  if (ok) {
    return (
      <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
        Action completed.
      </p>
    );
  }
  return null;
}
