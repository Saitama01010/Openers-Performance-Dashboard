import Link from "next/link";
import { redirect } from "next/navigation";

import { createTeamAction } from "@/admin/actions";
import { listTeams } from "@/admin/data";
import { adminErrorMessage, adminSuccessMessage } from "@/admin/messages";
import { getCurrentUser } from "@/auth/session";
import { InlineTeamSelect } from "@/components/admin/inline-user-fields";
import { SubmitButton } from "@/components/dashboard/action-controls";
import {
  EmptyTableRow,
  PageHeader,
  StatusBanner,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US") : "Not recorded";
}

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
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
    <section className="dashboard-page">
      <PageHeader
        actions={
          <Link
            className="ui-button ui-button--secondary"
            href="/teams/performance"
          >
            View team performance
          </Link>
        }
        description="Create reporting teams and maintain active manager and agent assignments."
        eyebrow="Administration"
        title="Teams"
      />

      {params.error ? (
        <StatusBanner tone="danger">
          {adminErrorMessage(params.error)}
        </StatusBanner>
      ) : null}
      {params.ok ? (
        <StatusBanner tone="success">
          {adminSuccessMessage(params.ok)}
        </StatusBanner>
      ) : null}

      <section className="ui-card ui-card--padded">
        <h2 className="ui-card__title">Create a team</h2>
        <p className="ui-card__subtitle">
          New teams become available for active user assignments.
        </p>
        <form action={createTeamAction} className="compact-action-form">
          <label className="ui-label compact-action-form__field">
            Team name
            <input className="ui-input" name="name" required />
          </label>
          <SubmitButton pendingLabel="Creating team">
            Create team
          </SubmitButton>
        </form>
      </section>

      <section className="ui-card mt-4">
        <div className="ui-card__header">
          <div>
            <h2 className="ui-card__title">Current members</h2>
            <p className="ui-card__subtitle">
              Reassign active managers and agents from the table.
            </p>
          </div>
        </div>
        <TableScroll label="Current team members">
          <table className="ui-table">
            <caption>Current team memberships and reassignment controls</caption>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Team</th>
                <th scope="col">Started</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <EmptyTableRow
                  colSpan={4}
                  description="Assign an active manager or agent from user administration."
                  title="No current team members"
                />
              ) : (
                members.map((member) => (
                  <tr key={member.id}>
                    <th scope="row">{member.profileName}</th>
                    <td className="capitalize">{member.membershipRole}</td>
                    <td>
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
                    <td>{formatDate(member.startedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </section>
  );
}
