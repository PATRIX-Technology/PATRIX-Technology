import { describe, expect, it } from 'vitest';
import { parseChildrenCsv, parseCsv } from '@/lib/domain/children';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,note\n"Doe, Jane",hello')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'hello'],
    ]);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsv('name\n"She said ""hi"""')).toEqual([['name'], ['She said "hi"']]);
  });

  it('drops fully blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseChildrenCsv', () => {
  it('reports a header error when required columns are missing', () => {
    const { headerError } = parseChildrenCsv('name,age\nMaya,4');
    expect(headerError).toMatch(/first_name/);
  });

  it('parses a well-formed row', () => {
    const { results, headerError } = parseChildrenCsv(
      'first_name,pronoun,class_name,preferred_language\nMaya,she,Sunflower,en',
    );
    expect(headerError).toBeUndefined();
    expect(results).toHaveLength(1);
    expect(results[0]!.data).toMatchObject({ firstName: 'Maya', pronoun: 'she', className: 'Sunflower', preferredLanguage: 'en' });
  });

  it('normalizes loose pronoun and language spellings', () => {
    const { results } = parseChildrenCsv(
      'first_name,pronoun,class_name,preferred_language\nZayd,Male,Starfish,Arabic',
    );
    expect(results[0]!.data).toMatchObject({ pronoun: 'he', preferredLanguage: 'ar' });
  });

  it('defaults an unrecognized pronoun to "they" rather than erroring', () => {
    const { results } = parseChildrenCsv(
      'first_name,pronoun,class_name,preferred_language\nRami,unspecified,,en',
    );
    expect(results[0]!.data?.pronoun).toBe('they');
  });

  it('flags a row with an empty first name', () => {
    const { results } = parseChildrenCsv(
      'first_name,pronoun,class_name,preferred_language\n,she,Sunflower,en',
    );
    expect(results[0]!.errors).toBeDefined();
    expect(results[0]!.data).toBeUndefined();
  });

  it('flags a first name containing digits', () => {
    const { results } = parseChildrenCsv(
      'first_name,pronoun,class_name,preferred_language\nMaya2,she,,en',
    );
    expect(results[0]!.errors?.[0]).toMatch(/numbers/);
  });

  it('reports the empty-file case explicitly', () => {
    const { headerError } = parseChildrenCsv('');
    expect(headerError).toMatch(/empty/i);
  });

  it('reads optional last_name/arabic_first_name/arabic_last_name columns when present', () => {
    const { results, headerError } = parseChildrenCsv(
      'first_name,last_name,arabic_first_name,arabic_last_name,pronoun,class_name,preferred_language\nHala,Al Mansoori,هالة,المنصوري,she,Sunflower,ar',
    );
    expect(headerError).toBeUndefined();
    expect(results[0]!.data).toMatchObject({
      firstName: 'Hala',
      lastName: 'Al Mansoori',
      arabicFirstName: 'هالة',
      arabicLastName: 'المنصوري',
    });
  });

  it('does not require last_name/arabic_first_name/arabic_last_name columns at all', () => {
    const { results, headerError } = parseChildrenCsv(
      'first_name,pronoun,class_name,preferred_language\nMaya,she,Sunflower,en',
    );
    expect(headerError).toBeUndefined();
    expect(results[0]!.data?.lastName).toBeUndefined();
    expect(results[0]!.data?.arabicFirstName).toBeUndefined();
    expect(results[0]!.data?.arabicLastName).toBeUndefined();
  });
});
