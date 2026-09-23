import { sql } from '../lib/db.mjs';
import { logEvent } from '../lib/logger.mjs';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id query parameter is required' });

  const [bill] = await sql`SELECT * FROM bills WHERE id = ${id}`;
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const items = await sql`
    SELECT * FROM bill_items WHERE bill_id = ${id} ORDER BY created_at ASC
  `;

  await logEvent('bill_viewed', { billId: id });
  res.status(200).json({ bill, items });
}
