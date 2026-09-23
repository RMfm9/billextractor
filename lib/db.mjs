// Vercel's Postgres/Neon integration has used several different environment
// variable naming schemes over time, depending on how and when the database
// was provisioned. Rather than guessing one name, check every variant that's
// been seen in the wild, and as a last resort build a connection string
// directly from the individual host/user/database/password pieces Neon also
// exposes.
import { neon } from '@neondatabase/serverless';

const URL_CANDIDATES = [
  'POSTGRES_URL',
  'DATABASE_URL',
  'POSTGRES_DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NO_SSL',
];

function findConnectionString() {
  for (const key of URL_CANDIDATES) {
    if (process.env[key]) return process.env[key];
  }

  // No full URL found under any known name - try assembling one from the
  // individual pieces, which Vercel's Neon integration also sets.
  const host = process.env.POSTGRES_HOST;
  const user = process.env.POSTGRES_PGUSER || process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_PGDATABASE || process.env.POSTGRES_DATABASE;

  if (host && user && password && database) {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
  }

  return null;
}

const connectionString = findConnectionString();

if (!connectionString) {
  const seen = Object.keys(process.env).filter((k) => /POSTGRES|DATABASE/i.test(k));
  console.error(
    'No usable database connection string found. Checked: ' + URL_CANDIDATES.join(', ') +
    ', and could not assemble one from POSTGRES_HOST/PGUSER/PGPASSWORD/PGDATABASE. ' +
    'Env var names containing POSTGRES/DATABASE that ARE set: ' +
    (seen.length ? seen.join(', ') : '(none found at all)')
  );
}

export const sql = neon(connectionString);
