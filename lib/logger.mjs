// One log "file" per calendar day (UTC), stored in Vercel Blob so it
// persists across function invocations (a serverless function's local disk
// does not persist). Each day's log is only created/touched when the app is
// actually used that day. Logs older than RETENTION_DAYS are deleted by the
// scheduled cron job (see api/cron/cleanup-logs.mjs).
import { put, list, del, get } from '@vercel/blob';

const RETENTION_DAYS = 30;

function todayKey(date = new Date()) {
  return `logs/${date.toISOString().slice(0, 10)}.log`; // e.g. logs/2026-09-20.log
}

async function streamToText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

// Appends one line to today's log file. Never throws - logging must not
// break the request it's attached to.
export async function logEvent(event, details = {}) {
  try {
    const key = todayKey();

    let existing = '';
    const found = await get(key, { access: 'private' });
    if (found && found.stream) existing = await streamToText(found.stream);

    const line = `[${new Date().toISOString()}] ${event}${
      Object.keys(details).length ? ' ' + JSON.stringify(details) : ''
    }\n`;

    await put(key, existing + line, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'text/plain',
    });
  } catch (err) {
    console.error('logEvent failed:', err);
  }
}

// Deletes any log file older than RETENTION_DAYS. Called daily by the
// /api/cron/cleanup-logs Vercel Cron Job.
export async function cleanupOldLogs() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const { blobs } = await list({ prefix: 'logs/' });
  let deleted = 0;

  for (const blob of blobs) {
    const dateStr = blob.pathname.replace('logs/', '').replace('.log', '');
    const timestamp = Date.parse(dateStr + 'T00:00:00Z');
    if (!Number.isNaN(timestamp) && timestamp < cutoff) {
      await del(blob.url);
      deleted++;
    }
  }
  return deleted;
}
