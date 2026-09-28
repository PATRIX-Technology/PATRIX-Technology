export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-ink-400">
      <span className="h-px flex-1 bg-[rgb(var(--color-border))]" />
      {label}
      <span className="h-px flex-1 bg-[rgb(var(--color-border))]" />
    </div>
  );
}
