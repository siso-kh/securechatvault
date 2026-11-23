export default function BlockedNotice({ error }) {
  return (
    <div role="alert" className="mt-3 border-l-2 border-crimson pl-3">
      <p className="m-0 text-xs text-ink">{error.message}</p>
      {error.rule && <p className="m-0 mt-0.5 text-xs text-faint">Rule: {error.rule}</p>}
    </div>
  );
}