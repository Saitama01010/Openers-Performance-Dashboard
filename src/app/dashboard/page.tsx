import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";
import { getScopedAgents, getScopedDashboardMetrics } from "@/dashboard/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [metrics, agents] = await Promise.all([
    getScopedDashboardMetrics(user),
    getScopedAgents(user),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-muted">Signed in as {user.name}</p>
            <h1 className="text-2xl font-semibold">Openers Performance</h1>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "admin" ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                href="/admin/users"
              >
                Users & Access
              </Link>
            ) : null}
            {user.role === "admin" ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                href="/admin/teams"
              >
                Teams
              </Link>
            ) : null}
            {user.role !== "agent" ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                href="/import"
              >
                Import CSV
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <article
              className="rounded-lg border border-border bg-surface p-4"
              key={metric.label}
            >
              <p className="text-sm text-muted">{metric.label}</p>
              <p className="mt-2 font-mono text-3xl font-semibold">
                {metric.value}
              </p>
            </article>
          ))}
        </div>
        <section className="mt-8 rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Scoped agents</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr className="border-t border-border" key={agent.id}>
                    <td className="px-4 py-3">{agent.name}</td>
                    <td className="px-4 py-3">{agent.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
