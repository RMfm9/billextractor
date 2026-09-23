import { sql } from '../lib/db.mjs';
import { logEvent } from '../lib/logger.mjs';

// Bills print dates in all sorts of formats (DD-MM-YYYY, DD/MM/YYYY, etc.).
// Postgres's DATE column only accepts unambiguous formats, so normalize
// before inserting rather than letting a bad date crash the whole save.
function normalizeDate(input) {
  if (!input) return null;
  const raw = String(input).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // already ISO

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null; // unparseable - save without a date rather than failing the whole bill
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vendorName, purchaseDate, invoiceNumber, gst, subtotal, total, items } = req.body || {};
  if (!vendorName || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'vendorName and at least one item are required' });
  }

  const cleanDate = normalizeDate(purchaseDate);

  try {
    // Vendor auto-population: reuse if it already exists, else create it.
    let [vendor] = await sql`SELECT id FROM vendors WHERE name = ${vendorName}`;
    if (!vendor) {
      [vendor] = await sql`
        INSERT INTO vendors (name) VALUES (${vendorName})
        RETURNING id
      `;
    }

    const [bill] = await sql`
      INSERT INTO bills (vendor_id, vendor_name, purchase_date, invoice_number, gst, subtotal, total)
      VALUES (
        ${vendor.id}, ${vendorName},
        ${cleanDate}, ${invoiceNumber || null},
        ${gst ?? null}, ${subtotal ?? null}, ${total ?? null}
      )
      RETURNING id
    `;

    for (const item of items) {
      await sql`
        INSERT INTO bill_items (bill_id, name, quantity, unit, unit_price, total_price)
        VALUES (
          ${bill.id}, ${item.name || ''}, ${item.quantity ?? null}, ${item.unit || null},
          ${item.unitPrice ?? null}, ${item.totalPrice ?? null}
        )
      `;
    }

    await logEvent('bill_saved', { billId: bill.id, vendorName, itemCount: items.length });
    res.status(200).json({ billId: bill.id, dateSaved: cleanDate });
  } catch (err) {
    console.error('bills-save failed:', err);
    await logEvent('bill_save_failed', { vendorName, error: err.message });
    res.status(500).json({ error: 'Failed to save bill: ' + err.message });
  }
}
