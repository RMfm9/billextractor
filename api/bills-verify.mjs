import { sql } from '../lib/db.mjs';
import { logEvent } from '../lib/logger.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { itemId, verified } = req.body || {};
  if (!itemId) return res.status(400).json({ error: 'itemId is required' });

  const [row] = await sql`SELECT id FROM bill_items WHERE id = ${itemId}`;
  if (!row) return res.status(404).json({ error: 'Item not found' });

  await sql`UPDATE bill_items SET physically_verified = ${!!verified} WHERE id = ${itemId}`;
  await logEvent('item_verification_updated', { itemId, verified: !!verified });
  res.status(200).json({ ok: true });
}
