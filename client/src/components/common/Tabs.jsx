export default function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-5">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`border-0 border-b-2 bg-transparent pb-1.5 text-sm hover:text-ink ${
              active ? 'border-crimson text-ink' : 'border-transparent text-muted'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}