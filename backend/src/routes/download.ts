import { Router, Response } from 'express';
import { query } from '../db/index';
import path from 'path';
import fs from 'fs';
import { AuthRequest, authMiddleware } from './auth';
import { inMemoryJobs } from '../services/queue';

const downloadRouter = Router();

const getOutputDir = (): string => process.env.OUTPUT_DIR || './outputs';

// Download file endpoint
downloadRouter.get('/:fileId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;

    // ── In-memory path (no DB needed) ──────────────────────────────────────
    // Check if any in-memory job has this outputFileId
    for (const job of inMemoryJobs.values()) {
      if ((job as any).outputFileId === fileId) {
        if (job.status !== 'completed') {
          res.status(400).json({ error: 'File is not ready for download yet' });
          return;
        }

        const filePath: string = (job as any).outputPath;
        const filename: string = (job as any).outputFilename || path.basename(filePath);

        if (!fs.existsSync(filePath)) {
          res.status(404).json({ error: 'Output file not found on disk' });
          return;
        }

        const ext = path.extname(filename).toLowerCase().slice(1);
        const mimeTypes: Record<string, string> = {
          mp4: 'video/mp4', avi: 'video/x-msvideo', mov: 'video/quicktime',
          mkv: 'video/x-matroska', webm: 'video/webm',
          gif: 'image/gif', mp3: 'audio/mpeg',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        const stat = fs.statSync(filePath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${job.data.inputFilename.replace(/\.[^.]+$/, '')}.${ext}"`);
        res.setHeader('Content-Length', stat.size);

        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // ── DB path ─────────────────────────────────────────────────────────────
    try {
      const { rows } = await query<{
        id: string;
        original_filename: string;
        stored_filename: string;
        file_size: number;
        mime_type: string;
        status: string;
      }>('SELECT * FROM file_uploads WHERE id = $1', [fileId]);

      if (rows.length === 0) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const file = rows[0];

      // Check job ownership
      const { rows: jobRows } = await query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM jobs WHERE output_file_id = $1`, [fileId]
      );

      if (jobRows.length > 0) {
        const job = jobRows[0];
        if (job.status !== 'completed') {
          res.status(400).json({ error: 'File is not ready for download' });
          return;
        }
      }

      const filePath = path.join(getOutputDir(), file.stored_filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found on disk' });
        return;
      }

      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
      res.setHeader('Content-Length', file.file_size);
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

export default downloadRouter;
