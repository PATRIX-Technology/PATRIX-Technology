import { describe, expect, it } from 'vitest';
import { capitalizeWords } from '@/lib/domain/names';

describe('capitalizeWords', () => {
  it('capitalises the first letter of each word', () => {
    expect(capitalizeWords('yousef hawwari')).toBe('Yousef Hawwari');
    expect(capitalizeWords('little explorers nursery')).toBe('Little Explorers Nursery');
  });

  it('leaves already-correct casing untouched', () => {
    expect(capitalizeWords('McDonald')).toBe('McDonald');
    expect(capitalizeWords("O'Brien Family")).toBe("O'Brien Family");
  });

  it('handles a single word', () => {
    expect(capitalizeWords('yousef')).toBe('Yousef');
  });

  it('is a no-op on scripts with no case distinction (Arabic)', () => {
    expect(capitalizeWords('حضانة المستكشفين الصغار')).toBe('حضانة المستكشفين الصغار');
  });

  it('handles an empty string', () => {
    expect(capitalizeWords('')).toBe('');
  });
});
