export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-5 w-9 items-center rounded-full border-0 p-0.5 transition-colors ${
        checked ? 'bg-crimson' : 'bg-line'
      }`}
    >
      <span
        className={`size-4 rounded-full bg-ink transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}