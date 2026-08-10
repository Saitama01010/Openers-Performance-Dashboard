"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import styles from "./login.module.css";

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
      {hidden ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

export function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel} htmlFor="login-password">
        Password
      </label>
      <span className={styles.inputShell}>
        <svg aria-hidden="true" className={styles.inputIcon} fill="none" viewBox="0 0 24 24">
          <rect height="10" rx="1.5" width="12" x="6" y="10" />
          <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        </svg>
        <input
          aria-describedby="password-visibility-hint"
          autoComplete="current-password"
          className={styles.input}
          id="login-password"
          maxLength={256}
          name="password"
          placeholder="Enter your password"
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className={styles.visibilityButton}
          onClick={() => setVisible((current) => !current)}
          title={visible ? "Hide password" : "Show password"}
          type="button"
        >
          <EyeIcon hidden={visible} />
        </button>
      </span>
      <span className={styles.srOnly} id="password-visibility-hint">
        Use the button at the end of this field to show or hide your password.
      </span>
    </div>
  );
}

export function LoginSubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      className={styles.submitButton}
      data-pending={pending || undefined}
      disabled={pending}
      type="submit"
    >
      {pending ? <span aria-hidden="true" className={styles.spinner} /> : null}
      <span aria-live="polite">{pending ? "Signing in..." : children}</span>
    </button>
  );
}
