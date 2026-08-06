import styles from "@/components/dashboard/performance/performance-page.module.css";

export default function PerformanceLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading performance analytics"
      className={`performance-page ${styles.page} ${styles.loadingPage}`}
    >
      <header className={styles.pageHeader}>
        <div className={styles.headingCopy}>
          <h1>Performance</h1>
          <p>Loading authorized performance analytics…</p>
        </div>
        <div className={`${styles.loadingBlock} ${styles.loadingControls}`} />
      </header>
      <div className={styles.content}>
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={`${styles.metricCard} ${styles.loadingCard}`} key={index} />
          ))}
        </div>
        <div className={styles.analyticsGrid}>
          <div className={`${styles.panel} ${styles.loadingPanel}`} />
          <div className={`${styles.panel} ${styles.loadingPanel}`} />
        </div>
        <div className={`${styles.panel} ${styles.loadingStates}`} />
        <div className={`${styles.panel} ${styles.loadingTable}`} />
      </div>
      <span className={styles.srOnly}>Loading performance data for the selected date range.</span>
    </section>
  );
}
