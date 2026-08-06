"use client";

import styles from "@/components/dashboard/performance/performance-page.module.css";

export default function PerformanceError({ reset }: { reset: () => void }) {
  return (
    <section className={`performance-page ${styles.page} ${styles.errorPage}`}>
      <div className={`${styles.panel} ${styles.errorPanel}`} role="alert">
        <span aria-hidden="true" className={styles.errorIcon}>!</span>
        <div>
          <h1>Performance data could not be loaded</h1>
          <p>
            Your scope remains protected. Retry the request, or return later if an authorized source is unavailable.
          </p>
        </div>
        <button className="ui-button ui-button--primary" onClick={reset} type="button">
          Try again
        </button>
      </div>
    </section>
  );
}
