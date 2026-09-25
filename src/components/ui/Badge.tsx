import type { HTMLAttributes } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  success: 'bg-lagoon-900/60 text-lagoon-300',
  warning: 'bg-saffron-900/60 text-saffron-300',
  danger: 'bg-coral-900/60 text-coral-300',
  info: 'bg-lagoon-900/60 text-lagoon-300',
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}
      {...props}
    />
  );
}
