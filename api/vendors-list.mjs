import { sql } from '../lib/db.mjs';
import { logEvent } from '../lib/logger.mjs';

export default async function handler(req, res) {
  const rows = await sql`SELECT name FROM vendors ORDER BY name ASC`;
  await logEvent('vendors_list');
  res.status(200).json({ vendors: rows.map((r) => r.name) });
}
