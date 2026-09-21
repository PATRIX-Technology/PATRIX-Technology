import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Spins up a throwaway Postgres database, applies the auth-schema stub,
 * every real migration in supabase/migrations, and the test-only grants —
 * then hands back a superuser client for setup/assertions plus a factory
 * for "as this Supabase role" clients. This is how tenant isolation, RLS,
 * and the security-definer RPCs (consent, quotas, spend caps, story
 * approval) are verified against ACTUAL Postgres RLS enforcement rather
 * than mocks. See docs/TEST_CHECKLIST.md for how to run this locally.
 */
const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

const REPO_ROOT = join(__dirname, '..', '..', '..');

export interface TestDb {
  adminClient: Client;
  databaseName: string;
  connectAs(opts: { role: 'anon' | 'authenticated' | 'service_role'; userId?: string }): Promise<Client>;
  teardown(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDb> {
  const databaseName = `patrix_test_${randomUUID().replace(/-/g, '')}`;

  const bootstrap = new Client({ connectionString: ADMIN_URL });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE ${databaseName}`);
  await bootstrap.end();

  const dbUrl = ADMIN_URL.replace(/\/[^/]*$/, `/${databaseName}`);
  const adminClient = new Client({ connectionString: dbUrl });
  await adminClient.connect();

  await adminClient.query(readFileSync(join(REPO_ROOT, 'supabase/testing/00_auth_stub.sql'), 'utf8'));
  await adminClient.query(readFileSync(join(REPO_ROOT, 'supabase/testing/01_storage_stub.sql'), 'utf8'));

  const migrationsDir = join(REPO_ROOT, 'supabase/migrations');
  const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    await adminClient.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  await adminClient.query(readFileSync(join(REPO_ROOT, 'supabase/testing/99_grants.sql'), 'utf8'));

  async function connectAs(opts: {
    role: 'anon' | 'authenticated' | 'service_role';
    userId?: string;
  }): Promise<Client> {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(`SET ROLE ${opts.role}`);
    if (opts.userId) {
      await client.query(`SET request.jwt.claim.sub = '${opts.userId}'`);
    }
    await client.query(`SET request.jwt.claim.role = '${opts.role}'`);
    return client;
  }

  async function teardown() {
    await adminClient.end();
    const cleanup = new Client({ connectionString: ADMIN_URL });
    await cleanup.connect();
    await cleanup.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [
      databaseName,
    ]);
    await cleanup.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await cleanup.end();
  }

  return { adminClient, databaseName, connectAs, teardown };
}

/** Creates an auth.users row and a matching profiles row, returning its id. */
export async function createUser(admin: Client, fullName: string, email?: string): Promise<string> {
  const id = randomUUID();
  await admin.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [
    id,
    email ?? `${id}@example.test`,
  ]);
  await admin.query('INSERT INTO profiles (id, full_name) VALUES ($1, $2)', [id, fullName]);
  return id;
}

export async function createTenantWithOwner(
  admin: Client,
  ownerId: string,
  name: string,
): Promise<string> {
  const id = randomUUID();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 8)}`;
  await admin.query('INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)', [id, name, slug]);
  await admin.query(
    'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, $3)',
    [id, ownerId, 'nursery_owner'],
  );
  return id;
}
