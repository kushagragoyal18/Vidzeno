import { Router, Response } from 'express';
import { query } from '../db/index';
import { AuthRequest, requireAuth } from './auth';

const usersRouter = Router();

// Get user's daily conversion count
usersRouter.get('/me/conversions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];

    const { rows } = await query<{ count: number }>(
      'SELECT count FROM daily_conversion_counts WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const count = rows.length > 0 ? rows[0].count : 0;
    const limit = req.user!.plan === 'premium' ? Infinity : 2;

    res.json({
      count,
      limit: limit === Infinity ? -1 : limit, // -1 means unlimited
      remaining: limit === Infinity ? -1 : Math.max(0, limit - count),
    });
  } catch (error) {
    console.error('Get conversions error:', error);
    res.status(500).json({ error: 'Failed to get conversion count' });
  }
});

// Get user's job history
usersRouter.get('/me/jobs', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { rows } = await query<{
      id: string;
      input_filename: string;
      output_format: string;
      status: string;
      progress: number;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, input_filename, output_format, status, progress, created_at, completed_at
       FROM jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      jobs: rows.map((row) => ({
        id: row.id,
        inputFilename: row.input_filename,
        outputFormat: row.output_format,
        status: row.status,
        progress: row.progress,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      })),
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

export default usersRouter;
