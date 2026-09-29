import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, type TestDb } from './db/setup';

/**
 * Regression tests for a security audit finding: profiles_self_update
 * (migration 0001) let any authenticated user write EVERY column of
 * their own profile row via RLS's `with check (id = auth.uid())` --
 * that check only restricts which ROW you can touch, not which
 * COLUMNS, and the underlying Postgres GRANT was never scoped down.
 * A single client-side update({is_platform_owner: true}) was enough to
 * grant full platform-owner access. Fixed in migration 0029 with a
 * column-level grant. See docs/DECISIONS.md "Two critical privilege-
 * escalation holes (security audit)".
 */
describe('profiles: a user cannot escalate their own privileges', () => {
  let db: TestDb;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    userId = await createUser(db.adminClient, 'Regular User');
  }, 60_000);

  afterAll(async () => db.teardown());

  it('cannot set is_platform_owner on their own profile', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId });
    await expect(
      client.query('update profiles set is_platform_owner = true where id = $1', [userId]),
    ).rejects.toThrow(/permission denied/i);
    await client.end();

    const { rows } = await db.adminClient.query('select is_platform_owner from profiles where id = $1', [userId]);
    expect(rows[0].is_platform_owner).toBe(false);
  });

  it('cannot set mfa_enrolled or is_platform_owner via a multi-column update, even alongside an allowed column', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId });
    await expect(
      client.query("update profiles set full_name = 'New Name', is_platform_owner = true where id = $1", [userId]),
    ).rejects.toThrow(/permission denied/i);
    await client.end();
  });

  it('CAN still update their own full_name and mfa_enrolled (the two legitimate client writes)', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId });
    await client.query("update profiles set full_name = 'Updated Name', mfa_enrolled = true where id = $1", [
      userId,
    ]);
    await client.end();

    const { rows } = await db.adminClient.query('select full_name, mfa_enrolled from profiles where id = $1', [
      userId,
    ]);
    expect(rows[0].full_name).toBe('Updated Name');
    expect(rows[0].mfa_enrolled).toBe(true);
  });

  it('cannot insert a new profiles row directly (every real one comes from a SECURITY DEFINER RPC)', async () => {
    const otherUserId = await db.adminClient
      .query("insert into auth.users (id, email) values (gen_random_uuid(), 'nobody@example.test') returning id")
      .then((r) => r.rows[0].id);

    const client = await db.connectAs({ role: 'authenticated', userId: otherUserId });
    await expect(
      client.query('insert into profiles (id, full_name) values ($1, $2)', [otherUserId, 'Nobody']),
    ).rejects.toThrow(/permission denied/i);
    await client.end();
  });
});

/**
 * Regression tests for a second finding in the same audit:
 * record_ai_spend (migration 0005) is SECURITY DEFINER but was never
 * revoked from anon/authenticated -- any signed-in user could call it
 * to trip the global kill switch (denial of service) or record a
 * negative amount (permanently defeating the AI spend cap). Fixed in
 * migration 0029.
 */
describe('record_ai_spend: not callable by client roles', () => {
  let db: TestDb;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    userId = await createUser(db.adminClient, 'Regular User');
  }, 60_000);

  afterAll(async () => db.teardown());

  it('authenticated cannot call record_ai_spend directly', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId });
    await expect(
      client.query('select record_ai_spend($1, null, null, $2, $3)', [
        '00000000-0000-0000-0000-000000000000',
        'gemini',
        1.0,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await client.end();
  });

  it('anon cannot call record_ai_spend directly', async () => {
    const client = await db.connectAs({ role: 'anon' });
    await expect(
      client.query('select record_ai_spend($1, null, null, $2, $3)', [
        '00000000-0000-0000-0000-000000000000',
        'gemini',
        1.0,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await client.end();
  });

  it('rejects a non-positive amount even called as service_role', async () => {
    const client = await db.connectAs({ role: 'service_role' });
    await expect(
      client.query('select record_ai_spend($1, null, null, $2, $3)', [
        '00000000-0000-0000-0000-000000000000',
        'gemini',
        -50,
      ]),
    ).rejects.toThrow(/amount must be positive/i);
    await client.end();
  });
});
