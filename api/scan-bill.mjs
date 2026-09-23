import { logEvent } from '../lib/logger.mjs';

const AZURE_ENDPOINT = (process.env.AZURE_ENDPOINT || '').replace(/\/$/, '');
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const API_VERSION = '2024-11-30';
const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 30; // ~45s max wait

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
    return res.status(500).json({ error: 'Azure is not configured. Set AZURE_ENDPOINT and AZURE_API_KEY.' });
  }

  const { fileBase64, contentType } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });

  const buffer = Buffer.from(fileBase64, 'base64');
  const analyzeUrl = `${AZURE_ENDPOINT}/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=${API_VERSION}`;

  const analyzeRes = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: buffer,
  });

  if (analyzeRes.status !== 202) {
    const detail = await analyzeRes.text();
    await logEvent('scan_failed', { reason: 'azure_rejected_request' });
    return res.status(502).json({ error: 'Azure rejected the analyze request', detail });
  }

  const opLocation = analyzeRes.headers.get('operation-location');
  if (!opLocation) return res.status(502).json({ error: 'Azure did not return an operation-location header' });

  let result = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(opLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY },
    });
    const pollData = await pollRes.json();
    if (pollData.status === 'succeeded') {
      result = pollData;
      break;
    }
    if (pollData.status === 'failed') {
      await logEvent('scan_failed', { reason: 'azure_analysis_failed' });
      return res.status(502).json({ error: 'Azure analysis failed', detail: pollData });
    }
  }

  if (!result) {
    await logEvent('scan_failed', { reason: 'azure_timeout' });
    return res.status(504).json({ error: 'Azure analysis timed out' });
  }

  const doc = result.analyzeResult?.documents?.[0];
  const fields = doc?.fields || {};

  const items = (fields.Items?.valueArray || []).map((entry) => {
    const f = entry.valueObject || {};
    return {
      name: f.Description?.valueString || f.Description?.content || '',
      quantity: f.Quantity?.valueNumber ?? null,
      unit: f.Unit?.valueString || f.Unit?.content || '',
      unitPrice: f.UnitPrice?.valueCurrency?.amount ?? null,
      totalPrice: f.Amount?.valueCurrency?.amount ?? null,
    };
  });

  const extracted = {
    vendorName: fields.VendorName?.valueString || fields.VendorName?.content || '',
    purchaseDate: fields.InvoiceDate?.valueDate || fields.InvoiceDate?.content || '',
    invoiceNumber: fields.InvoiceId?.valueString || fields.InvoiceId?.content || '',
    subtotal: fields.SubTotal?.valueCurrency?.amount ?? null,
    gst: fields.TotalTax?.valueCurrency?.amount ?? null,
    total: fields.InvoiceTotal?.valueCurrency?.amount ?? null,
    items,
  };

  await logEvent('bill_scanned', { vendorName: extracted.vendorName, itemCount: items.length });
  res.status(200).json({ extracted });
}
