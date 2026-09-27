import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * See docs/DECISIONS.md "Staff invites: real accounts via a shareable
 * link, not email". inviteStaffAction used to only write an audit_logs
 * row; it now inserts a staff_invites row the owner can turn into a
 * shareable link, and accept_staff_invite is the only way a new
 * tenant_members row for that tenant can come from it -- it must add the
 * invited user to the EXISTING tenant, never create a new one.
 */
function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

describe('staff invites (real account, joins the existing tenant)', () => {
  let db: TestDb;
  let ownerId: string;
  let tenantId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Little Explorers');
  }, 60_000);

  afterAll(async () => db.teardown());

  async function insertInvite(email: string, role = 'nursery_staff'): Promise<{ token: string; inviteId: string }> {
    const { token, tokenHash } = newToken();
    const { rows } = await db.adminClient.query(
      `insert into staff_invites (tenant_id, email, role, token_hash, invited_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [tenantId, email, role, tokenHash, ownerId],
    );
    return { token, inviteId: rows[0].id };
  }

  it('the owner can create an invite for their own tenant', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    const { token, tokenHash } = newToken();
    await client.query(
      `insert into staff_invites (tenant_id, email, role, token_hash, invited_by)
       values ($1, $2, 'nursery_staff', $3, $4)`,
      [tenantId, 'new-staff@example.test', tokenHash, ownerId],
    );
    await client.end();
    expect(token).toBeTruthy(); // the raw token itself is only ever held client-side
  });

  it('a non-owner member cannot create an invite for that tenant', async () => {
    const staffId = await createUser(db.adminClient, 'Existing Staff');
    await db.adminClient.query('insert into tenant_members (tenant_id, user_id, role) values ($1, $2, $3)', [
      tenantId,
      staffId,
      'nursery_staff',
    ]);

    const client = await db.connectAs({ role: 'authenticated', userId: staffId });
    const { tokenHash } = newToken();
    await expect(
      client.query(
        `insert into staff_invites (tenant_id, email, role, token_hash, invited_by)
         values ($1, $2, 'nursery_staff', $3, $4)`,
        [tenantId, 'someone@example.test', tokenHash, staffId],
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await client.end();
  });

  it('an outsider cannot see this tenant\'s invites', async () => {
    const outsiderId = await createUser(db.adminClient, 'Outsider');
    const { inviteId } = await insertInvite('secret@example.test');

    const client = await db.connectAs({ role: 'authenticated', userId: outsiderId });
    const { rows } = await client.query('select id from staff_invites where id = $1', [inviteId]);
    expect(rows).toHaveLength(0);
    await client.end();
  });

  it('get_staff_invite_info works anonymously and reports the tenant name + role', async () => {
    const { token } = await insertInvite('anon-lookup@example.test', 'nursery_admin');

    const client = await db.connectAs({ role: 'anon' });
    const { rows } = await client.query('select (get_staff_invite_info($1)).*', [token]);
    await client.end();

    expect(rows[0].found).toBe(true);
    expect(rows[0].tenant_name).toBe('Little Explorers');
    expect(rows[0].role).toBe('nursery_admin');
    expect(rows[0].email).toBe('anon-lookup@example.test');
    expect(rows[0].status).toBe('pending');
  });

  it('get_staff_invite_info reports found=false for a garbage token', async () => {
    const client = await db.connectAs({ role: 'anon' });
    const { rows } = await client.query('select (get_staff_invite_info($1)).*', ['not-a-real-token']);
    await client.end();
    expect(rows[0].found).toBe(false);
  });

  it('accept_staff_invite requires authentication', async () => {
    const { token } = await insertInvite('needs-auth@example.test');
    const client = await db.connectAs({ role: 'authenticated' }); // no userId set
    await expect(client.query('select accept_staff_invite($1, $2)', [token, 'Someone'])).rejects.toThrow(
      /must be authenticated/i,
    );
    await client.end();
  });

  it('accept_staff_invite joins the invited person to the EXISTING tenant, not a new one', async () => {
    const email = 'joins-existing@example.test';
    const { token } = await insertInvite(email, 'nursery_admin');
    const newUserId = await createUser(db.adminClient, 'placeholder', email);

    const client = await db.connectAs({ role: 'authenticated', userId: newUserId });
    const { rows } = await client.query('select accept_staff_invite($1, $2) as tenant_id', [
      token,
      'Newly Joined',
    ]);
    await client.end();

    expect(rows[0].tenant_id).toBe(tenantId);

    const member = await db.adminClient.query(
      'select role from tenant_members where tenant_id = $1 and user_id = $2',
      [tenantId, newUserId],
    );
    expect(member.rows[0].role).toBe('nursery_admin');

    // The whole point: no second tenant, no second subscription, came out
    // of this -- they joined the inviting tenant's existing one.
    const subscriptionCount = await db.adminClient.query(
      'select count(*)::int as count from subscriptions where tenant_id = $1',
      [tenantId],
    );
    expect(subscriptionCount.rows[0].count).toBe(1);

    const profile = await db.adminClient.query('select full_name from profiles where id = $1', [newUserId]);
    expect(profile.rows[0].full_name).toBe('Newly Joined');

    const invite = await db.adminClient.query('select status, accepted_by from staff_invites where token_hash = $1', [
      createHash('sha256').update(token).digest('hex'),
    ]);
    expect(invite.rows[0].status).toBe('accepted');
    expect(invite.rows[0].accepted_by).toBe(newUserId);
  });

  it('rejects a second acceptance of the same invite', async () => {
    const email = 'double-accept@example.test';
    const { token } = await insertInvite(email);
    const firstUserId = await createUser(db.adminClient, 'First', email);
    const secondUserId = await createUser(db.adminClient, 'Second', email);

    const firstClient = await db.connectAs({ role: 'authenticated', userId: firstUserId });
    await firstClient.query('select accept_staff_invite($1, $2)', [token, 'First']);
    await firstClient.end();

    const secondClient = await db.connectAs({ role: 'authenticated', userId: secondUserId });
    await expect(secondClient.query('select accept_staff_invite($1, $2)', [token, 'Second'])).rejects.toThrow(
      /already been used/i,
    );
    await secondClient.end();
  });

  it('rejects acceptance when the authenticated email does not match the invite', async () => {
    const { token } = await insertInvite('intended-for@example.test');
    const wrongUserId = await createUser(db.adminClient, 'Wrong Person', 'someone-else@example.test');

    const client = await db.connectAs({ role: 'authenticated', userId: wrongUserId });
    await expect(client.query('select accept_staff_invite($1, $2)', [token, 'Wrong Person'])).rejects.toThrow(
      /different email/i,
    );
    await client.end();
  });

  it('rejects an expired invite', async () => {
    const email = 'expired@example.test';
    const { token, tokenHash } = newToken();
    await db.adminClient.query(
      `insert into staff_invites (tenant_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, 'nursery_staff', $3, $4, now() - interval '1 day')`,
      [tenantId, email, tokenHash, ownerId],
    );
    const userId = await createUser(db.adminClient, 'Too Late', email);

    const client = await db.connectAs({ role: 'authenticated', userId });
    await expect(client.query('select accept_staff_invite($1, $2)', [token, 'Too Late'])).rejects.toThrow(
      /expired/i,
    );
    await client.end();
  });

  it('no client role can write to staff_invites directly except via insert -- no update policy exists', async () => {
    const { inviteId } = await insertInvite('no-direct-update@example.test');
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(
      client.query("update staff_invites set status = 'accepted' where id = $1", [inviteId]),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await client.end();
  });
});
