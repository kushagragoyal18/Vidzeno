import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { query } from '../db/index';

// Rate limiter for conversion attempts (free users)
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10'), // 10 requests per minute
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  message: {
    error: 'Too many conversion attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter (general)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Check daily conversion limit
export const checkConversionLimit = async (
  userId: string,
  plan: 'free' | 'premium'
): Promise<{
  allowed: boolean;
  reason?: string;
  dailyLimit: number;
  dailyCount: number;
}> => {
  // Premium users have unlimited conversions
  if (plan === 'premium') {
    return { allowed: true, dailyLimit: -1, dailyCount: 0 };
  }

  // Get daily limit from env
  const dailyLimit = parseInt(process.env.MAX_CONVERSIONS_FREE_DAILY || '2');

  // Get today's count — fall back to 0 if DB is unavailable
  let count = 0;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await query<{ count: number }>(
      'SELECT count FROM daily_conversion_counts WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    count = rows.length > 0 ? rows[0].count : 0;
  } catch {
    // DB unavailable — allow the conversion
    count = 0;
  }

  if (count >= dailyLimit) {
    return {
      allowed: false,
      reason: 'Daily conversion limit reached. Upgrade to Premium for unlimited conversions.',
      dailyLimit,
      dailyCount: count,
    };
  }

  return { allowed: true, dailyLimit, dailyCount: count };
};

// Middleware to check conversion limit
export const conversionLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const limit = await checkConversionLimit(user.id, user.plan);

  if (!limit.allowed) {
    res.status(403).json({
      error: limit.reason,
      dailyLimit: limit.dailyLimit,
      dailyCount: limit.dailyCount,
    });
    return;
  }

  // Attach limit info to request
  (req as any).conversionLimit = limit;
  next();
};
