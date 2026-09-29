'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './Button';

/** Drop-in replacement for a submit Button inside a <form action={...}>.
 * useFormStatus only reports the form's pending state from a descendant
 * of the <form>, never from the component that renders the form itself
 * -- so this has to be its own component, not inline in the form. Without
 * it, submitting shows no feedback while the server action runs, which
 * on a slow request (cold start, a slower query) reads as the click
 * having done nothing. */
export function SubmitButton({ disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return <Button type="submit" isLoading={pending} disabled={pending || disabled} {...props} />;
}
