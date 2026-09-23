import { cleanupOldLogs, logEvent } from '../../lib/logger.mjs';

export default async function handler(req, res) {
  // When CRON_SECRET is set, Vercel Cron automatically sends it as a Bearer
  // token, and this rejects any other caller from triggering cleanup.
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const deleted = await cleanupOldLogs();
  await logEvent('log_cleanup_ran', { deletedFiles: deleted });
  res.status(200).json({ ok: true, deleted });
}
