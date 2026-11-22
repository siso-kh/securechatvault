import { useId } from 'react';

export default function Field({ label, error, ...inputProps }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <input
        id={id}
        aria-invalid={!!error}
        className="rounded-sm border border-line bg-bg px-3 py-2.5 text-sm placeholder:text-faint focus:border-crimson focus:outline-none aria-invalid:border-danger"
        {...inputProps}
      />
      {error && <p className="m-0 text-xs text-danger">{error}</p>}
    </div>
  );
}