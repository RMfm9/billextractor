import { sql } from '../lib/db.mjs';
import { logEvent } from '../lib/logger.mjs';

export default async function handler(req, res) {
  const from = req.query.from || null;
  const to = req.query.to || null;
  const vendorRaw = req.query.vendor || null;
  const vendorFilter = vendorRaw && vendorRaw !== 'All Vendors' ? vendorRaw : null;

  const rows = await sql`
    SELECT
      b.id,
      b.vendor_name,
      b.purchase_date,
      b.total,
      NOT EXISTS (
        SELECT 1 FROM bill_items bi
        WHERE bi.bill_id = b.id AND bi.physically_verified = false
      ) AS verified
    FROM bills b
    WHERE (${from}::date IS NULL OR b.purchase_date >= ${from}::date)
      AND (${to}::date IS NULL OR b.purchase_date <= ${to}::date)
      AND (${vendorFilter}::text IS NULL OR b.vendor_name = ${vendorFilter})
    ORDER BY b.purchase_date DESC NULLS LAST, b.created_at DESC
  `;

  await logEvent('bills_search', { from, to, vendor: vendorFilter, resultCount: rows.length });
  res.status(200).json({ bills: rows });
}
