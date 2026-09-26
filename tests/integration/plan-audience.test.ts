import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDb } from './db/setup';

/**
 * Proves the schema side of family plans (0017_family_plans.sql):
 * plans.audience exists, defaults to 'nursery' for rows that don't set it
 * (so the pre-existing Starter/Growth/Network rows are unaffected), and a
 * query filtered by audience -- exactly what the settings page
 * (src/app/[locale]/(dashboard)/dashboard/settings/page.tsx) runs -- only
 * ever returns plans for the requested tenant type. The other half of the
 * enforcement (a tenant cannot check out for the wrong audience's plan) is
 * the pure planIsAvailableForTenant function, unit-tested in
 * tests/unit/billing.test.ts.
 */
describe('plans.audience (family vs nursery plans)', () => {
  let db: TestDb;
  let starterId: string;
  let familyId: string;
  let familyPlusId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    const starter = await db.adminClient.query(
      `insert into plans (key, name, price_monthly_cents, price_annual_cents, stories_per_month)
       values ('starter', 'Starter', 49900, 479000, 25)
       returning id`,
    );
    starterId = starter.rows[0].id;

    const family = await db.adminClient.query(
      `insert into plans (key, name, price_monthly_cents, price_annual_cents, currency, stories_per_month, seats_included, audience)
       values ('family', 'Family', 900, 9000, 'USD', 1, 1, 'family')
       returning id`,
    );
    familyId = family.rows[0].id;

    const familyPlus = await db.adminClient.query(
      `insert into plans (key, name, price_monthly_cents, price_annual_cents, currency, stories_per_month, seats_included, audience)
       values ('family_plus', 'Family Plus', 1900, 19000, 'USD', 3, 1, 'family')
       returning id`,
    );
    familyPlusId = familyPlus.rows[0].id;
  }, 60_000);

  afterAll(async () => db.teardown());

  it('defaults a plan with no audience specified to nursery, unaffected by the new column', async () => {
    const { rows } = await db.adminClient.query('select audience from plans where id = $1', [starterId]);
    expect(rows[0].audience).toBe('nursery');
  });

  it('a nursery-scoped query returns only Starter, never Family or Family Plus', async () => {
    const { rows } = await db.adminClient.query(
      `select key from plans where is_active and audience = 'nursery' order by price_monthly_cents`,
    );
    expect(rows.map((r) => r.key)).toEqual(['starter']);
  });

  it("a family-scoped query returns both family plans, never Starter", async () => {
    const { rows } = await db.adminClient.query(
      `select key from plans where is_active and audience = 'family' order by price_monthly_cents`,
    );
    expect(rows.map((r) => r.key)).toEqual(['family', 'family_plus']);
  });

  it('Family Plus grants 3x the stories of Family, at 1 seat each (no staff seats for an individual)', async () => {
    const { rows } = await db.adminClient.query(
      `select key, stories_per_month, seats_included from plans where id in ($1, $2) order by stories_per_month`,
      [familyId, familyPlusId],
    );
    expect(rows).toEqual([
      { key: 'family', stories_per_month: 1, seats_included: 1 },
      { key: 'family_plus', stories_per_month: 3, seats_included: 1 },
    ]);
  });
});
