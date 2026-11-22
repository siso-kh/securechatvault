const tones = { success: 'bg-success', danger: 'bg-danger', muted: 'bg-faint' };

export default function StatusDot({ tone = 'muted', children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`size-1.5 rounded-full ${tones[tone]}`} />
      {children}
    </span>
  );
}