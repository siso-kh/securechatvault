const variants = {
  primary: 'bg-crimson text-ink hover:bg-crimson-hover',
  ghost: 'border-line bg-transparent text-ink hover:border-faint',
  link: 'bg-transparent p-0 font-normal text-muted hover:text-ink',
};

export default function Button({ variant = 'primary', type = 'button', className = '', children, ...rest }) {
  return (
    <button
      type={type}
      className={`rounded-sm border border-transparent px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}