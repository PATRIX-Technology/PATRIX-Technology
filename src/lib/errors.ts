/** Bare `String(error)` on a non-Error throw (e.g. a raw Supabase/Postgrest
 * error object) renders as the useless "[object Object]", and
 * `(error as Error).message` on the same value is `undefined` — which
 * JSON.stringify silently drops, so `NextResponse.json({ error: ... })`
 * ends up sending back literally "{}" with no way to tell what failed.
 * This pulls a real message out of anything error-shaped before falling
 * back to JSON. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
