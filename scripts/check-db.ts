/**
 * Database readiness check.
 *
 * Probes the live Supabase project through PostgREST to report which migrations
 * have been applied, whether the storage bucket exists, and whether the RPC the
 * rate limiter depends on is present.
 *
 * PostgREST cannot run DDL, so this only *reports* — it never changes anything.
 * Fix anything it flags by running the named file in the Supabase SQL editor.
 *
 * Usage: npx tsx scripts/check-db.ts
 */

import { readFileSync } from 'node:fs';

function loadEnv(): { url: string; key: string } {
  // Prefer a real environment (CI, Vercel) and fall back to .env.local for local runs.
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    try {
      const file = readFileSync('.env.local', 'utf8');
      url ??= file.match(/^SUPABASE_URL=(.*)$/m)?.[1]?.trim();
      key ??= file.match(/^SUPABASE_SERVICE_KEY=(.*)$/m)?.[1]?.trim();
    } catch {
      /* no .env.local — rely on the environment */
    }
  }

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (env or .env.local).');
  }
  return { url: url.replace(/\/$/, ''), key };
}

const { url, key } = loadEnv();
const headers = { apikey: key, Authorization: `Bearer ${key}` };

type Status = 'ok' | 'missing' | 'error';
interface Check { label: string; migration: string | null; status: Status; detail: string }

const checks: Check[] = [];

function record(label: string, migration: string | null, status: Status, detail = ''): void {
  checks.push({ label, migration, status, detail });
}

/** A column exists if selecting it does not raise 42703 (undefined_column). */
async function checkColumns(table: string, columns: string[], migration: string | null): Promise<void> {
  const response = await fetch(`${url}/rest/v1/${table}?select=${columns.join(',')}&limit=1`, { headers });
  if (response.ok) {
    record(`${table}(${columns.join(', ')})`, migration, 'ok');
    return;
  }
  const body = await response.text();
  const code = (() => { try { return JSON.parse(body).code as string; } catch { return ''; } })();
  if (code === '42703' || code === '42P01' || code === 'PGRST205') {
    record(`${table}(${columns.join(', ')})`, migration, 'missing', JSON.parse(body).message as string);
  } else {
    record(`${table}(${columns.join(', ')})`, migration, 'error', body.slice(0, 160));
  }
}

/** A relation exists if a bare select returns 2xx rather than 42P01. */
async function checkRelation(name: string, migration: string | null): Promise<void> {
  const response = await fetch(`${url}/rest/v1/${name}?select=*&limit=1`, { headers });
  if (response.ok) {
    record(`relation ${name}`, migration, 'ok');
    return;
  }
  const body = await response.text();
  const code = (() => { try { return JSON.parse(body).code as string; } catch { return ''; } })();
  const absent = code === '42P01' || code === 'PGRST205';
  record(`relation ${name}`, migration, absent ? 'missing' : 'error', body.slice(0, 160));
}

/**
 * An RPC exists if calling it does not 404. We deliberately pass empty arrays,
 * which `consume_quota` returns NULL for without touching any counter — so this
 * probe is side-effect free.
 */
async function checkRpc(name: string, body: unknown, migration: string | null): Promise<void> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.ok) {
    record(`rpc ${name}()`, migration, 'ok');
    return;
  }
  const text = await response.text();
  const notFound = response.status === 404 || text.includes('PGRST202');
  record(`rpc ${name}()`, migration, notFound ? 'missing' : 'error', text.slice(0, 160));
}

async function checkBucket(name: string): Promise<void> {
  const response = await fetch(`${url}/storage/v1/bucket/${name}`, { headers });
  if (response.ok) {
    const bucket = await response.json() as { public?: boolean };
    record(`storage bucket "${name}"`, null, 'ok', bucket.public ? 'PUBLIC — should be private' : 'private');
    return;
  }
  record(`storage bucket "${name}"`, null, response.status === 404 ? 'missing' : 'error', String(response.status));
}

async function main(): Promise<void> {
  // Base schema
  await checkRelation('sessions', 'db/schema.sql');
  await checkRelation('rooms', 'db/schema.sql');
  await checkRelation('items', 'db/schema.sql');
  await checkRelation('captures', 'db/schema.sql');
  await checkRelation('quotes', 'db/schema.sql');

  // Migrations, in order
  await checkRelation('scan_usage', 'db/migrations/0001_scan_usage.sql');
  await checkRpc('consume_quota', { p_keys: [], p_limits: [] }, 'db/migrations/0001_scan_usage.sql');
  await checkColumns('items', ['box'], 'db/migrations/0002_item_box.sql');
  await checkColumns('items', ['uncertainty_reason', 'seen_in_images'], 'db/schema.sql');
  await checkColumns('sessions', ['user_id', 'device_id'], 'db/migrations/0004_session_ownership.sql');

  await checkBucket('captures');

  // Report
  const pad = Math.max(...checks.map((c) => c.label.length));
  console.log('\nDatabase readiness\n');
  for (const check of checks) {
    const mark = check.status === 'ok' ? 'OK     ' : check.status === 'missing' ? 'MISSING' : 'ERROR  ';
    console.log(`  ${mark}  ${check.label.padEnd(pad)}  ${check.detail}`);
  }

  const broken = checks.filter((c) => c.status !== 'ok');
  if (broken.length === 0) {
    console.log('\nEverything the app needs is present.\n');
    return;
  }

  if (broken.some((c) => c.label.includes('consume_quota'))) {
    console.log(
      '\n  !! consume_quota is absent, and lib/rate-limit.ts fails OPEN on RPC error.\n'
      + '     That means scan rate limiting is currently NOT enforced at all.',
    );
  }

  const files = [...new Set(broken.map((c) => c.migration).filter(Boolean))];
  console.log(`\n${broken.length} problem(s). Run these in the Supabase SQL editor, in order:\n`);
  for (const file of files) console.log(`  - ${file}`);
  if (broken.some((c) => c.label.startsWith('storage bucket'))) {
    console.log('  - create a PRIVATE storage bucket named "captures" in the dashboard');
  }
  console.log('');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
