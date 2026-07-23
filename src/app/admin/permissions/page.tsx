import { redirect } from "next/navigation";

import {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/admin/policy";
import { getCurrentUser } from "@/auth/session";

export default async function AdminPermissionsPage() {
  const actor = await getCurrentUser();

  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/dashboard");

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-muted">Admin only</p>
        <h2 className="text-xl font-semibold">Role and Permissions</h2>
        <p className="mt-2 text-sm text-muted">
          Role defaults are seeded into the database. User-specific allow/deny overrides are managed on each user detail page.
        </p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <article className="rounded-lg border border-border bg-surface p-5" key={group.name}>
            <h3 className="font-semibold">{group.name}</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-2">Permission</th>
                    <th className="py-2">Admin</th>
                    <th className="py-2">Manager</th>
                    <th className="py-2">Agent</th>
                    <th className="py-2">Restricted</th>
                  </tr>
                </thead>
                <tbody>
                  {group.permissions.map((permission) => (
                    <tr className="border-t border-border" key={permission}>
                      <td className="py-2 font-mono text-xs">{permission}</td>
                      <td className="py-2">{ROLE_DEFAULT_PERMISSIONS.admin.includes(permission) ? "Allow" : "Deny"}</td>
                      <td className="py-2">{ROLE_DEFAULT_PERMISSIONS.manager.includes(permission) ? "Allow" : "Deny"}</td>
                      <td className="py-2">{ROLE_DEFAULT_PERMISSIONS.agent.includes(permission) ? "Allow" : "Deny"}</td>
                      <td className="py-2">{ADMIN_ONLY_PERMISSIONS.has(permission) ? "Admin only" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

