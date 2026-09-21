import type { InputHTMLAttributes, LabelHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-ink-700">
          {label}
        </label>
        <input
          ref={ref}
          id={fieldId}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={Boolean(error) || undefined}
          className={`focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-ink-900 placeholder:text-ink-400 ${
            error ? 'border-coral-500' : ''
          } ${className}`}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-ink-500">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-coral-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);

TextField.displayName = 'TextField';

export function Label({ className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`text-sm font-medium text-ink-700 ${className}`} {...props} />;
}
