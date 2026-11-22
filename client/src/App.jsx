export default function App() {
  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 'var(--text-hero)' }}>Vault</h1>
      <p style={{ color: 'var(--text-muted)' }}>Sign in to start a protected chat.</p>
      <button style={{ background: 'var(--crimson)', border: 0, padding: '10px 20px', borderRadius: 6 }}>
        Sign in
      </button>
    </div>
  );
}