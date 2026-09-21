import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('consent workflow', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;
  let childId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Nursery');
    const { rows } = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Zayd', 'he') returning id`,
      [tenantId],
    );
    childId = rows[0].id;
  }, 60_000);

  afterAll(async () => db.teardown());

  it('records granted consent via the public token-based RPC and updates the child', async () => {
    const rawToken = 'test-token-grant';
    await db.adminClient.query(
      `insert into consent_requests (tenant_id, child_id, token_hash) values ($1, $2, $3)`,
      [tenantId, childId, sha256(rawToken)],
    );

    const anonClient = await db.connectAs({ role: 'anon' });
    await anonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken]);
    await anonClient.end();

    const { rows } = await db.adminClient.query('select consent_status from children where id = $1', [
      childId,
    ]);
    expect(rows[0].consent_status).toBe('granted');
  });

  it('rejects an unknown token', async () => {
    const anonClient = await db.connectAs({ role: 'anon' });
    await expect(anonClient.query(`select respond_to_consent($1, 'granted')`, ['not-a-real-token'])).rejects.toThrow(
      /not found/i,
    );
    await anonClient.end();
  });

  it('rejects answering the same consent request twice', async () => {
    const rawToken = 'test-token-double-answer';
    await db.adminClient.query(
      `insert into consent_requests (tenant_id, child_id, token_hash) values ($1, $2, $3)`,
      [tenantId, childId, sha256(rawToken)],
    );

    const anonClient = await db.connectAs({ role: 'anon' });
    await anonClient.query(`select respond_to_consent($1, 'declined')`, [rawToken]);
    await expect(anonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken])).rejects.toThrow(
      /already been answered/i,
    );
    await anonClient.end();
  });

  it('rejects an expired consent link', async () => {
    const rawToken = 'test-token-expired';
    await db.adminClient.query(
      `insert into consent_requests (tenant_id, child_id, token_hash, expires_at) values ($1, $2, $3, now() - interval '1 day')`,
      [tenantId, childId, sha256(rawToken)],
    );

    const anonClient = await db.connectAs({ role: 'anon' });
    await expect(anonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken])).rejects.toThrow(
      /expired/i,
    );
    await anonClient.end();
  });

  it('lets an owner withdraw consent, flipping child + request status', async () => {
    const rawToken = 'test-token-withdraw';
    await db.adminClient.query(
      `insert into consent_requests (tenant_id, child_id, token_hash, status, responded_at) values ($1, $2, $3, 'granted', now())`,
      [tenantId, childId, sha256(rawToken)],
    );
    await db.adminClient.query(`update children set consent_status = 'granted' where id = $1`, [childId]);

    const ownerClient = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await ownerClient.query('select withdraw_consent($1)', [childId]);
    await ownerClient.end();

    const { rows } = await db.adminClient.query('select consent_status from children where id = $1', [
      childId,
    ]);
    expect(rows[0].consent_status).toBe('withdrawn');
  });

  it('does not let a different tenant withdraw consent for a child that is not theirs', async () => {
    const otherOwnerId = await createUser(db.adminClient, 'Other Owner');
    await createTenantWithOwner(db.adminClient, otherOwnerId, 'Other Nursery');

    const otherClient = await db.connectAs({ role: 'authenticated', userId: otherOwnerId });
    await expect(otherClient.query('select withdraw_consent($1)', [childId])).rejects.toThrow(
      /not authorized/i,
    );
    await otherClient.end();
  });
});
