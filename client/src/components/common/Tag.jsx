export default function Tag({ children }) {
  return (
    <span className="inline-block rounded-full border border-crimson bg-crimson/20 px-2.5 text-xs leading-relaxed text-ink">
      {children}
    </span>
  );
}