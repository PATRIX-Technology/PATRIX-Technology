import type { ReactNode } from 'react';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-[rgb(var(--color-border))] px-6 py-12 text-center">
      <h3 className="font-display text-lg text-ink-800">{title}</h3>
      {body && <p className="max-w-sm text-sm text-ink-500">{body}</p>}
      {action}
    </div>
  );
}
