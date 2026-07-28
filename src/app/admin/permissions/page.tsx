import { redirect } from "next/navigation";

import {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/admin/policy";
import { getCurrentUser } from "@/auth/session";
import {
  PageHeader,
  StatusBadge,
  TableScroll,
} from "@/components/dashboard/dashboard-primitives";

function PermissionBadge({ allowed }: { allowed: boolean }) {
  return (
    <StatusBadge tone={allowed ? "success" : "neutral"}>
      {allowed ? "Allow" : "Deny"}
    </StatusBadge>
  );
}

export default async function AdminPermissionsPage() {
  const actor = await getCurrentUser();

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  return (
    <div className="dashboard-page">
      <PageHeader
        description="Review seeded role defaults. User-specific allow or deny overrides remain available on each user record."
        eyebrow="Admin only"
        title="Roles and permissions"
      />

      <div className="permission-grid">
        {PERMISSION_GROUPS.map((group) => (
          <article className="ui-card ui-card--padded" key={group.name}>
            <h2 className="ui-card__title">{group.name}</h2>
            <TableScroll label={`${group.name} role permissions`}>
              <table className="ui-table">
                <caption>{group.name} permission defaults by role</caption>
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    <th scope="col">Admin</th>
                    <th scope="col">Manager</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Restriction</th>
                  </tr>
                </thead>
                <tbody>
                  {group.permissions.map((permission) => (
                    <tr key={permission}>
                      <th className="permission-name" scope="row">
                        {permission}
                      </th>
                      <td>
                        <PermissionBadge
                          allowed={ROLE_DEFAULT_PERMISSIONS.admin.includes(
                            permission,
                          )}
                        />
                      </td>
                      <td>
                        <PermissionBadge
                          allowed={ROLE_DEFAULT_PERMISSIONS.manager.includes(
                            permission,
                          )}
                        />
                      </td>
                      <td>
                        <PermissionBadge
                          allowed={ROLE_DEFAULT_PERMISSIONS.agent.includes(
                            permission,
                          )}
                        />
                      </td>
                      <td>
                        {ADMIN_ONLY_PERMISSIONS.has(permission) ? (
                          <StatusBadge tone="warning">Admin only</StatusBadge>
                        ) : (
                          <span aria-label="No additional restriction">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </article>
        ))}
      </div>
    </div>
  );
}
