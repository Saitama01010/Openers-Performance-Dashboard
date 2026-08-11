import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ui/theme-toggle";

function AuthBrand() {
  return (
    <Link className="auth-brand" href="/login">
      <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
        <path d="m5 16 8-10 5 4-5 6 5 6-5 4z" />
        <path d="m15 16 7-9 5 4-4 5 4 5-5 4z" />
      </svg>
      <span>
        <strong>Openers</strong>
        <small>Performance</small>
      </span>
    </Link>
  );
}
export function AuthShell({
  children,
  description,
  footer,
  title,
}: {
  children: ReactNode;
  description: string;
  footer?: ReactNode;
  title: string;
}) {
  return (
    <main className="auth-shell">
      <ThemeToggle className="auth-theme-switch" />
      <aside className="auth-shell__context">
        <AuthBrand />
        <div className="auth-shell__message">
          <p>Operational performance, with the data trail intact.</p>
          <ul>
            <li>Role-scoped performance</li>
            <li>Active import versioning</li>
            <li>Auditable administration</li>
          </ul>
        </div>
        <p className="auth-shell__footnote">
          Private workspace · Access is enforced on the server
        </p>
      </aside>
      <section className="auth-shell__main">
        <div className="auth-card">
          <div className="auth-card__brand">
            <AuthBrand />
          </div>
          <header>
            <p className="auth-card__overline">Openers workspace</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
          {footer ? <footer>{footer}</footer> : null}
        </div>
      </section>
    </main>
  );
}

export function PasswordRequirements() {
  return (
    <p className="auth-password-requirements" id="password-requirements">
      Use at least 12 characters. A longer, unique passphrase is recommended.
    </p>
  );
}
