import { Router, Request, Response, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../db/index';
import { AuthRequest, authMiddleware } from './auth';
import { addConversionJob, inMemoryJobs } from '../services/queue';
import { runConversion } from '../services/converter';
import { inMemoryFiles } from './upload';
import { rateLimiter, checkConversionLimit } from '../middleware/limits';

const convertRouter = Router();

// Supported output formats
export const SUPPORTED_FORMATS = new Set([
  'mp4',
  'avi',
  'mov',
  'mkv',
  'webm',
  'gif',
  'mp3',
]);

// Format descriptions
export const FORMAT_DESCRIPTIONS: Record<string, string> = {
  mp4: 'MP4 - Most compatible format',
  avi: 'AVI - Microsoft video format',
  mov: 'MOV - Apple QuickTime format',
  mkv: 'MKV - Matroska video container',
  webm: 'WEBM - Web video format',
  gif: 'GIF - Animated image format',
  mp3: 'MP3 - Audio only',
};

// Start conversion
convertRouter.post('/', authMiddleware as RequestHandler, rateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { fileId, outputFormat } = req.body;

    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }

    if (!outputFormat || !SUPPORTED_FORMATS.has(outputFormat.toLowerCase())) {
      res.status(400).json({
        error: 'Invalid output format',
        supportedFormats: Array.from(SUPPORTED_FORMATS),
      });
      return;
    }

    const format = outputFormat.toLowerCase();
    const userId = req.user?.id || 'guest';
    const userPlan = req.user?.plan || 'free';

    // Check conversion limit (falls back gracefully when DB is down)
    const limitCheck = await checkConversionLimit(userId, userPlan);
    if (!limitCheck.allowed) {
      res.status(403).json({
        error: limitCheck.reason,
        dailyLimit: limitCheck.dailyLimit,
        dailyCount: limitCheck.dailyCount,
      });
      return;
    }

    // Locate the uploaded file — check in-memory store first, then DB
    let inputFilePath: string | null = null;
    let inputFilename = 'unknown';
    let fileSize = 0;

    const memFile = inMemoryFiles.get(fileId);
    if (memFile) {
      inputFilePath = memFile.file_path;
      inputFilename = memFile.original_filename;
      fileSize = memFile.file_size;
    } else {
      try {
        const { rows } = await query<{
          id: string;
          original_filename: string;
          stored_filename: string;
          file_size: number;
          status: string;
        }>('SELECT * FROM file_uploads WHERE id = $1', [fileId]);
        if (rows.length > 0) {
          const uploadDir = process.env.UPLOAD_DIR || './uploads';
          inputFilePath = require('path').join(uploadDir, rows[0].stored_filename);
          inputFilename = rows[0].original_filename;
          fileSize = rows[0].file_size;
        }
      } catch { /* DB unavailable */ }
    }

    if (!inputFilePath) {
      res.status(404).json({ error: 'File not found. Please upload again.' });
      return;
    }

    // Create job record in memory (and optionally DB)
    const jobId = uuidv4();
    const watermark = userPlan !== 'premium';
    const priority: 'standard' | 'priority' = userPlan === 'premium' ? 'priority' : 'standard';

    // Try to persist to DB (non-critical)
    try {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO jobs (id, user_id, input_file_id, input_filename, output_format, status, watermark, priority, file_size)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
          [jobId, userId === 'guest' ? null : userId, fileId, inputFilename, format, watermark, priority, fileSize]
        );
        if (userId !== 'guest') {
          const today = new Date().toISOString().split('T')[0];
          await client.query(
            `INSERT INTO daily_conversion_counts (user_id, date, count) VALUES ($1, $2, 1)
             ON CONFLICT (user_id, date) DO UPDATE SET count = daily_conversion_counts.count + 1`,
            [userId, today]
          );
        }
      });
    } catch (err) {
      console.error('⚠️ Failed to save job to database:', err);
    }

    // Register job in in-memory store
    await addConversionJob({ jobId, userId: userId === 'guest' ? null : userId, inputFileId: fileId, inputFilename, outputFormat: format, watermark, priority });

    // Respond immediately — conversion runs in the background
    res.json({
      jobId,
      status: 'pending',
      estimatedTime: userPlan === 'premium' ? '1-2 minutes' : '3-5 minutes',
    });

    // 🔥 Run FFmpeg conversion directly (no worker/Redis needed)
    const capturedPath = inputFilePath;
    setImmediate(async () => {
      try {
        await runConversion(jobId, capturedPath, format, watermark);
      } catch (err) {
        console.error(`Conversion failed for job ${jobId}:`, err);
      }
    });

  } catch (error) {
    console.error('Convert error:', error);
    res.status(500).json({ error: 'Conversion request failed' });
  }
});

// Get job status
convertRouter.get('/job/:jobId', authMiddleware as RequestHandler, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check in-memory first
    const memJob = inMemoryJobs.get(jobId);
    if (memJob) {
      const downloadUrl = memJob.status === 'completed' && (memJob as any).outputFileId
        ? `/api/download/${(memJob as any).outputFileId}`
        : null;

      res.json({
        jobId: memJob.jobId,
        status: memJob.status,
        progress: memJob.progress,
        inputFilename: memJob.data.inputFilename,
        outputFormat: memJob.data.outputFormat,
        outputFilename: (memJob as any).outputFilename || null,
        errorMessage: memJob.failedReason || null,
        watermark: memJob.data.watermark,
        createdAt: memJob.createdAt,
        completedAt: memJob.status === 'completed' ? new Date() : null,
        downloadUrl,
      });
      return;
    }

    // Fall back to DB
    try {
      const { rows } = await query<{
        id: string;
        user_id: string;
        input_filename: string;
        output_format: string;
        status: string;
        error_message: string | null;
        progress: number;
        output_filename: string | null;
        output_file_id: string | null;
        watermark: boolean;
        created_at: Date;
        completed_at: Date | null;
      }>('SELECT * FROM jobs WHERE id = $1', [jobId]);

      if (rows.length === 0) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const job = rows[0];
      const downloadUrl = job.status === 'completed' && job.output_file_id
        ? `/api/download/${job.output_file_id}`
        : null;

      res.json({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        inputFilename: job.input_filename,
        outputFormat: job.output_format,
        outputFilename: job.output_filename,
        errorMessage: job.error_message,
        watermark: job.watermark,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        downloadUrl,
      });
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }

  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// Get supported formats (no auth, no DB)
convertRouter.get('/formats', (_req: Request, res: Response) => {
  res.json({
    formats: Array.from(SUPPORTED_FORMATS).map((format) => ({
      id: format,
      name: format.toUpperCase(),
      description: FORMAT_DESCRIPTIONS[format] || format.toUpperCase(),
    })),
  });
});

export default convertRouter;
