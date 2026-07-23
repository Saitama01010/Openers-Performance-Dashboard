import { redirect } from "next/navigation";

import {
  assignTeamManagerAction,
  createTeamAction,
  moveAgentToTeamAction,
  removeTeamMembershipAction,
  renameTeamAction,
  setTeamStatusAction,
} from "@/admin/actions";
import { listTeams } from "@/admin/data";
import { adminErrorMessage } from "@/admin/messages";
import { getCurrentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

function fmt(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "-";
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

  const { teams, managers, agents } = await listTeams(actor);

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <StatusMessage error={params.error} ok={params.ok} />

      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-muted">Admin only</p>
        <h2 className="text-xl font-semibold">Teams</h2>
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
          <h2 className="font-semibold">Team administration</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3">Agent count</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr className="border-t border-border align-top" key={team.id}>
                  <td className="px-4 py-3">
                    <form action={renameTeamAction} className="flex min-w-64 gap-2">
                      <input name="teamId" type="hidden" value={team.id} />
                      <input
                        className="w-full rounded-md border border-border bg-background px-3 py-2"
                        defaultValue={team.name}
                        name="name"
                      />
                      <button className="rounded-md border border-border px-3 py-2 font-medium">
                        Rename
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">{team.manager?.profileName ?? "-"}</td>
                  <td className="px-4 py-3">{team.agentCount}</td>
                  <td className="px-4 py-3">{team.active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3">{fmt(team.createdAt)}</td>
                  <td className="px-4 py-3">
                    <form action={setTeamStatusAction} className="space-y-2">
                      <input name="teamId" type="hidden" value={team.id} />
                      <input name="active" type="hidden" value={team.active ? "false" : "true"} />
                      {team.active ? (
                        <label className="flex items-center gap-2 text-xs text-danger">
                          <input name="confirmTeamStatus" type="checkbox" />
                          Confirm
                        </label>
                      ) : null}
                      <button className="font-medium text-danger hover:underline">
                        {team.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">Assign manager</h2>
          <form action={assignTeamManagerAction} className="mt-4 space-y-3">
            <TeamSelect teams={teams} />
            <label className="block text-sm font-medium">
              Manager
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" name="managerId" required>
                <option value="">Select manager</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.email})
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-danger">Changing managers ends the old manager membership and creates a new historical record.</p>
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Assign manager
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">Move agent</h2>
          <form action={moveAgentToTeamAction} className="mt-4 space-y-3">
            <TeamSelect teams={teams} />
            <label className="block text-sm font-medium">
              Agent
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" name="agentId" required>
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.email})
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-danger">Moving an agent preserves historical memberships and metric team snapshots.</p>
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Move agent
            </button>
          </form>
        </section>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Current members</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.flatMap((team) =>
                team.members.map((member) => (
                  <tr className="border-t border-border" key={member.id}>
                    <td className="px-4 py-3">{team.name}</td>
                    <td className="px-4 py-3">{member.profileName}</td>
                    <td className="px-4 py-3">{member.membershipRole}</td>
                    <td className="px-4 py-3">{fmt(member.startedAt)}</td>
                    <td className="px-4 py-3">
                      <form action={removeTeamMembershipAction}>
                        <input name="membershipId" type="hidden" value={member.id} />
                        <button className="font-medium text-danger hover:underline">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
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

function TeamSelect({
  teams,
}: {
  teams: { id: string; name: string; active: boolean }[];
}) {
  return (
    <label className="block text-sm font-medium">
      Team
      <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" name="teamId" required>
        <option value="">Select team</option>
        {teams.map((team) => (
          <option disabled={!team.active} key={team.id} value={team.id}>
            {team.name}{team.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
    </label>
  );
}
