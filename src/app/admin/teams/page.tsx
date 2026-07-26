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
import {
  ConfirmSubmitButton,
  SubmitButton,
} from "@/components/dashboard/action-controls";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

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
  const currentMembers = teams.flatMap((team) =>
    team.members.map((member) => ({ member, team })),
  );

  return (
    <div className="dashboard-page">
      <PageHeader
        description="Create teams, assign managers, and maintain current memberships while preserving history."
        eyebrow="Admin only"
        title="Teams"
      />
      <StatusMessage error={params.error} ok={params.ok} />

      <section aria-labelledby="create-team-heading" className="ui-card ui-card--padded">
        <h2 className="ui-card__title" id="create-team-heading">
          Create team
        </h2>
        <form action={createTeamAction} className="mt-4 flex flex-wrap gap-3">
          <label className="ui-label min-w-72 flex-1">
            Team name <span className="ui-required">(required)</span>
            <input
              autoComplete="off"
              className="ui-input"
              name="name"
              required
            />
          </label>
          <SubmitButton
            className="self-end"
            pendingLabel="Creating team"
          >
            Create team
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="team-admin-heading" className="ui-card">
        <div className="ui-card__header">
          <h2 className="ui-card__title" id="team-admin-heading">
            Team administration
          </h2>
        </div>
        <TableScroll label="Team administration">
          <table className="ui-table">
            <caption>Team managers, status, and administration actions</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Manager</th>
                <th scope="col">Agent count</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr className="border-t border-border align-top" key={team.id}>
                  <td className="px-4 py-3">
                    <form action={renameTeamAction} className="flex min-w-64 gap-2">
                      <input name="teamId" type="hidden" value={team.id} />
                      <input
                        aria-label={`Rename ${team.name}`}
                        className="ui-input"
                        defaultValue={team.name}
                        name="name"
                      />
                      <SubmitButton pendingLabel="Renaming team" variant="secondary">
                        Rename
                      </SubmitButton>
                    </form>
                  </td>
                  <td className="px-4 py-3">{team.manager?.profileName ?? "-"}</td>
                  <td className="px-4 py-3">{team.agentCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={team.active ? "success" : "neutral"}>
                      {team.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">{fmt(team.createdAt)}</td>
                  <td className="px-4 py-3">
                    <form action={setTeamStatusAction} className="space-y-2">
                      <input name="teamId" type="hidden" value={team.id} />
                      <input name="active" type="hidden" value={team.active ? "false" : "true"} />
                      {team.active ? (
                        <>
                          <input name="confirmTeamStatus" type="hidden" value="true" />
                          <ConfirmSubmitButton
                            confirmLabel="Deactivate team"
                            description={`${team.name} will no longer be available for new assignments. Existing membership history is preserved.`}
                            pendingLabel="Deactivating team"
                            title={`Deactivate ${team.name}?`}
                          >
                            Deactivate
                          </ConfirmSubmitButton>
                        </>
                      ) : (
                        <SubmitButton pendingLabel="Activating team" variant="secondary">
                          Activate
                        </SubmitButton>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
              {teams.length === 0 ? (
                <EmptyTableRow
                  colSpan={6}
                  description="Create a team to begin assigning managers and agents."
                  title="No teams yet"
                />
              ) : null}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section className="admin-action-grid">
        <section className="ui-card ui-card--padded">
          <h2 className="ui-card__title">Assign manager</h2>
          <form action={assignTeamManagerAction} className="mt-4 space-y-3">
            <TeamSelect teams={teams} />
            <label className="ui-label">
              Manager
              <select className="ui-select" name="managerId" required>
                <option value="">Select manager</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.email})
                  </option>
                ))}
              </select>
            </label>
            <StatusBanner tone="warning">
              Changing managers ends the old manager membership and creates a new historical record.
            </StatusBanner>
            <SubmitButton pendingLabel="Assigning manager">
              Assign manager
            </SubmitButton>
          </form>
        </section>

        <section className="ui-card ui-card--padded">
          <h2 className="ui-card__title">Move agent</h2>
          <form action={moveAgentToTeamAction} className="mt-4 space-y-3">
            <TeamSelect teams={teams} />
            <label className="ui-label">
              Agent
              <select className="ui-select" name="agentId" required>
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.email})
                  </option>
                ))}
              </select>
            </label>
            <StatusBanner tone="info">
              Moving an agent preserves historical memberships and metric team snapshots.
            </StatusBanner>
            <SubmitButton pendingLabel="Moving agent">
              Move agent
            </SubmitButton>
          </form>
        </section>
      </section>

      <section aria-labelledby="current-members-heading" className="ui-card">
        <div className="ui-card__header">
          <h2 className="ui-card__title" id="current-members-heading">
            Current members
          </h2>
        </div>
        <TableScroll label="Current team members">
          <table className="ui-table">
            <caption>Current team membership records</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Started</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentMembers.map(({ member, team }) => (
                  <tr key={member.id}>
                    <td>{team.name}</td>
                    <td>{member.profileName}</td>
                    <td className="capitalize">{member.membershipRole}</td>
                    <td>{fmt(member.startedAt)}</td>
                    <td className="px-4 py-3">
                      <form action={removeTeamMembershipAction}>
                        <input name="membershipId" type="hidden" value={member.id} />
                        <ConfirmSubmitButton
                          confirmLabel="Remove member"
                          description={`${member.profileName} will be removed from ${team.name}. Historical membership records remain available.`}
                          pendingLabel="Removing member"
                          title={`Remove ${member.profileName}?`}
                        >
                          Remove
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
              ))}
              {currentMembers.length === 0 ? (
                <EmptyTableRow
                  colSpan={5}
                  description="Assigned managers and agents will appear here."
                  title="No current memberships"
                />
              ) : null}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}

function StatusMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <StatusBanner tone="danger">
        {adminErrorMessage(error)}
      </StatusBanner>
    );
  }
  if (ok) {
    return (
      <StatusBanner tone="success">Action completed.</StatusBanner>
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
    <label className="ui-label">
      Team
      <select className="ui-select" name="teamId" required>
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
