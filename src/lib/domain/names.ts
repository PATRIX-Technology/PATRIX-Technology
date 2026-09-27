/**
 * Capitalises the first letter of each word, leaving the rest of every
 * word untouched — so "yousef hawwari" becomes "Yousef Hawwari" but a
 * name someone already typed correctly (e.g. "McDonald", "O'Brien")
 * is never re-cased into something wrong. A no-op on Arabic (and any
 * other script with no case distinction), since `toUpperCase()` simply
 * has nothing to change there.
 */
export function capitalizeWords(value: string): string {
  return value
    .split(' ')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}
