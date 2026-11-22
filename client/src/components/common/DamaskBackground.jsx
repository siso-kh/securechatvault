import styles from './DamaskBackground.module.css';

export default function DamaskBackground({ blurred = false, children }) {
  return (
    <div className={styles.root}>
      <div className={`${styles.pattern} ${blurred ? styles.blurred : ''}`} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
  );
}