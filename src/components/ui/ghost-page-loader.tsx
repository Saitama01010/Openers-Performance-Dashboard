import styles from "./ghost-page-loader.module.css";

const solidParts = [
  "top0",
  "top1",
  "top2",
  "top3",
  "top4",
  "st0",
  "st1",
  "st2",
  "st3",
  "st4",
  "st5",
] as const;

const firstFlickerParts = ["an1", "an18", "an6", "an12", "an7", "an13", "an8", "an11"] as const;
const secondFlickerParts = ["an2", "an17", "an3", "an16", "an4", "an15", "an9", "an10"] as const;

export function GhostPageLoader({
  fullScreen = false,
  label = "Loading page",
}: {
  fullScreen?: boolean;
  label?: string;
}) {
  return (
    <section
      aria-busy="true"
      aria-label={label}
      aria-live="polite"
      className={`${styles.loader}${fullScreen ? ` ${styles.fullScreen}` : ""}`}
      data-slot="ghost-page-loader"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={styles.ghost}>
        <div className={styles.body}>
          {solidParts.map((part) => (
            <span className={`${styles.part} ${styles.solid}`} data-part={part} key={part} />
          ))}
          {firstFlickerParts.map((part) => (
            <span className={`${styles.part} ${styles.flickerFirst}`} data-part={part} key={part} />
          ))}
          {secondFlickerParts.map((part) => (
            <span className={`${styles.part} ${styles.flickerSecond}`} data-part={part} key={part} />
          ))}
          <span className={styles.eye} />
          <span className={`${styles.eye} ${styles.eyeRight}`} />
          <span className={styles.pupil} />
          <span className={`${styles.pupil} ${styles.pupilRight}`} />
        </div>
        <span className={styles.shadow} />
      </div>
    </section>
  );
}
