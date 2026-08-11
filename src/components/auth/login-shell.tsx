import Image from "next/image";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import styles from "./login.module.css";

function BrandLockup() {
  return (
    <div className={styles.brandLockup}>
      <span className={styles.brandImageFrame}>
        <Image
          alt=""
          className={styles.brandImage}
          height={1080}
          loading="eager"
          src="/brand/openers-performance-logo.png"
          width={1080}
        />
      </span>
      <span className={styles.brandType}>
        <strong>Openers</strong>
        <small>Performance</small>
      </span>
    </div>
  );
}

function ScopeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" />
      <circle cx="16" cy="16" r="6" />
      <circle cx="16" cy="16" fill="currentColor" r="2" stroke="none" />
    </svg>
  );
}

function VersionIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
      <path d="m16 4 12 6-12 6L4 10l12-6Z" />
      <path d="m4 16 12 6 12-6M4 22l12 6 12-6" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
      <path d="M16 3 27 8v8c0 6.4-4.2 10.8-11 13-6.8-2.2-11-6.6-11-13V8l11-5Z" />
    </svg>
  );
}

function PrivacyIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32">
      <path d="M16 3 27 8v8c0 6.4-4.2 10.8-11 13-6.8-2.2-11-6.6-11-13V8l11-5Z" />
      <path d="M12.5 15.5h7v6h-7zM14 15.5v-2a2 2 0 0 1 4 0v2" />
    </svg>
  );
}

const features = [
  {
    description: "Access only what matters to your role.",
    icon: <ScopeIcon />,
    title: "Role-scoped performance",
  },
  {
    description: "Track changes and maintain clarity.",
    icon: <VersionIcon />,
    title: "Active import versioning",
  },
  {
    description: "Complete visibility with every action.",
    icon: <AuditIcon />,
    title: "Auditable administration",
  },
];

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.shell}>
      <ThemeToggle className="auth-theme-switch" />
      <aside className={styles.brandPanel} aria-label="Openers Performance">
        <div className={styles.brandContent}>
          <BrandLockup />

          <div className={styles.brandMessage}>
            <h1>
              Operational
              <br />
              performance, with
              <br />
              the data trail intact.
            </h1>
            <div className={styles.brandDivider} />
            <ul className={styles.featureList}>
              {features.map((feature) => (
                <li key={feature.title}>
                  <span className={styles.featureIcon}>{feature.icon}</span>
                  <span>
                    <strong>{feature.title}</strong>
                    <small>{feature.description}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className={styles.privacyNote}>
            <span className={styles.privacyIcon}>
              <PrivacyIcon />
            </span>
            <span>Private workspace</span>
            <span aria-hidden="true">•</span>
            <span>Access is enforced on the server</span>
          </p>
        </div>

        <Image
          alt=""
          aria-hidden="true"
          className={styles.decorativeMark}
          height={1080}
          src="/brand/openers-performance-logo.png"
          width={1080}
        />
      </aside>

      <section className={styles.formPanel} aria-labelledby="login-heading">
        <div className={styles.card}>{children}</div>
      </section>
    </main>
  );
}
