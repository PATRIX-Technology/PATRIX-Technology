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
      `insert into consent_requests (tenant_id, child_id, token_hash) values ($1, $2, $3)`,
      [tenantId, childId, sha256(rawToken)],
    );
    // Grant via the real respond_to_consent RPC rather than a direct
    // `update children set consent_status = ...` -- migration 0030's
    // children_consent_status_guard trigger now blocks that update path
    // for every role, including this admin client, which is exactly the
    // point: 'granted'/'declined' can only ever be reached through here.
    const grantingAnonClient = await db.connectAs({ role: 'anon' });
    await grantingAnonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken]);
    await grantingAnonClient.end();

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

  describe('photo-scoped requests require phone verification (migration 0036)', () => {
    it('rejects granting a photo-scoped request until the phone is OTP-verified', async () => {
      const rawToken = 'test-token-photo-unverified';
      await db.adminClient.query(
        `insert into consent_requests (tenant_id, child_id, token_hash, scope, parent_phone)
         values ($1, $2, $3, '{"story": true, "photo": true}'::jsonb, '+971500000001')`,
        [tenantId, childId, sha256(rawToken)],
      );

      const anonClient = await db.connectAs({ role: 'anon' });
      await expect(anonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken])).rejects.toThrow(
        /phone verification is required/i,
      );
      await anonClient.end();
    });

    it('allows granting a photo-scoped request after mark_consent_otp_verified', async () => {
      const rawToken = 'test-token-photo-verified';
      await db.adminClient.query(
        `insert into consent_requests (tenant_id, child_id, token_hash, scope, parent_phone)
         values ($1, $2, $3, '{"story": true, "photo": true}'::jsonb, '+971500000002')`,
        [tenantId, childId, sha256(rawToken)],
      );

      const anonClient = await db.connectAs({ role: 'anon' });
      await anonClient.query('select mark_consent_otp_verified($1)', [rawToken]);
      await anonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken]);
      await anonClient.end();

      const { rows } = await db.adminClient.query(
        `select status, otp_verified_at from consent_requests where token_hash = $1`,
        [sha256(rawToken)],
      );
      expect(rows[0].status).toBe('granted');
      expect(rows[0].otp_verified_at).not.toBeNull();
    });

    it('does not require phone verification for a non-photo request', async () => {
      const rawToken = 'test-token-story-only';
      await db.adminClient.query(
        `insert into consent_requests (tenant_id, child_id, token_hash, scope)
         values ($1, $2, $3, '{"story": true, "photo": false}'::jsonb)`,
        [tenantId, childId, sha256(rawToken)],
      );

      const anonClient = await db.connectAs({ role: 'anon' });
      await anonClient.query(`select respond_to_consent($1, 'granted')`, [rawToken]);
      await anonClient.end();

      const { rows } = await db.adminClient.query(
        `select status from consent_requests where token_hash = $1`,
        [sha256(rawToken)],
      );
      expect(rows[0].status).toBe('granted');
    });

    it('send_consent_otp_target returns the phone only for a pending photo-scoped request', async () => {
      const rawToken = 'test-token-otp-target';
      await db.adminClient.query(
        `insert into consent_requests (tenant_id, child_id, token_hash, scope, parent_phone)
         values ($1, $2, $3, '{"story": true, "photo": true}'::jsonb, '+971500000003')`,
        [tenantId, childId, sha256(rawToken)],
      );

      const anonClient = await db.connectAs({ role: 'anon' });
      const { rows } = await anonClient.query('select send_consent_otp_target($1) as phone', [rawToken]);
      expect(rows[0].phone).toBe('+971500000003');

      const { rows: nonPhotoRows } = await anonClient.query('select send_consent_otp_target($1) as phone', [
        'test-token-double-answer',
      ]);
      expect(nonPhotoRows[0].phone).toBeNull();
      await anonClient.end();
    });

    it('get_consent_request_info reports otp_required and a masked phone, never the raw number', async () => {
      const rawToken = 'test-token-lookup-masked';
      await db.adminClient.query(
        `insert into consent_requests (tenant_id, child_id, token_hash, scope, parent_phone)
         values ($1, $2, $3, '{"story": true, "photo": true}'::jsonb, '+971501234567')`,
        [tenantId, childId, sha256(rawToken)],
      );

      const anonClient = await db.connectAs({ role: 'anon' });
      const { rows } = await anonClient.query('select * from get_consent_request_info($1)', [rawToken]);
      await anonClient.end();

      expect(rows[0].otp_required).toBe(true);
      expect(rows[0].otp_verified).toBe(false);
      expect(rows[0].parent_phone_masked).toBe('***********67');
      expect(rows[0].parent_phone_masked).not.toContain('971501234567');
    });
  });
});
