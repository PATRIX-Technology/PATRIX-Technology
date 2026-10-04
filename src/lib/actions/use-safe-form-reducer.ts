'use client';

import { useTranslations } from 'next-intl';
import type { ActionResult } from './auth';

/**
 * Wraps a useFormState reducer so a genuine network failure -- the
 * device drops connection mid-request, so the fetch Next.js generates
 * to invoke the Server Action rejects instead of resolving -- comes
 * back as a normal failed ActionResult instead of an uncaught
 * rejection. Uncaught, that rejection crashes the whole page to the
 * root error boundary ("Something went wrong" / raw "TypeError:
 * network error"), reported live on the sign-in form on a weak mobile
 * connection.
 *
 * This is the same root cause already fixed once for
 * AutoRefresh/GenerationProgressBanner's background polling (see
 * docs/DECISIONS.md) -- every one of this app's ~20 useFormState forms
 * shares the identical unguarded-reducer shape, so this fixes all of
 * them at the one place they all route through, instead of hand-adding
 * the same try/catch to each form.
 */
export function useSafeFormReducer<State extends ActionResult>(
  reducer: (prevState: State, formData: FormData) => Promise<State>,
): (prevState: State, formData: FormData) => Promise<State> {
  const t = useTranslations('common');
  return async (prevState, formData) => {
    try {
      return await reducer(prevState, formData);
    } catch (error) {
      console.error('Form action failed:', error);
      return { ...prevState, error: t('error') };
    }
  };
}
