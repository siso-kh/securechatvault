import styles from './DamaskBackground.module.css';

export default function DamaskBackground({ blurred = false, fill = false, children }) {
  return (
    <div className={`${styles.root} ${fill ? styles.fill : ''}`}>
      <div className={`${styles.pattern} ${blurred ? styles.blurred : ''}`} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
  );
}