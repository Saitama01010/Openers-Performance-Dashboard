import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/auth/actions";
import { getCurrentUser } from "@/auth/session";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users & Access" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/import", label: "Imports" },
  { href: "/admin/audit", label: "Audit Log" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Signed in as {user.name}</p>
              <h1 className="text-2xl font-semibold">Admin Console</h1>
            </div>
            <form action={logoutAction}>
              <button className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
                Sign out
              </button>
            </form>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto text-sm">
            {navItems.map((item) => (
              <Link
                className="whitespace-nowrap rounded-md border border-border px-3 py-2 font-medium hover:bg-background"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}

