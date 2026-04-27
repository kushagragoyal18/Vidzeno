import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { query } from '../db/index';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const COOKIE_NAME = 'vidzeno_session';

const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const appendToSqlFile = (name: string | null, email: string) => {
  const filePath = path.join(process.cwd(), '..', 'users_data.sql');
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const sqlStatement = `INSERT INTO users_backup (name, email, sign_up_date_time) VALUES ('${name?.replace(/'/g, "''") || 'Unknown'}', '${email}', '${timestamp}');\n`;
  try {
    fs.appendFileSync(filePath, sqlStatement);
  } catch (err) {
    console.error('Failed to write to users_data.sql', err);
  }
};

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

declare global {
  namespace Express {
    interface User {
      id: string;
      name?: string;
      email: string;
      plan: 'free' | 'premium';
    }
  }
}

export interface AuthRequest extends Request {}

const generateToken = (payload: object): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
};

const setAuthCookie = (res: Response, token: string): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
};

const clearAuthCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
};

export const authMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      plan: 'free' | 'premium';
    };

    // Try to verify user still exists in DB; fall back to JWT payload if DB is down
    try {
      const { rows } = await query<{ id: string; email: string; plan: 'free' | 'premium' }>(
        'SELECT id, email, plan FROM users WHERE id = $1',
        [decoded.id]
      );
      if (rows.length > 0) {
        req.user = rows[0];
      }
    } catch {
      // DB unavailable — trust the JWT payload
      req.user = { id: decoded.id, email: decoded.email, plan: decoded.plan };
    }

    next();
  } catch (error) {
    // Invalid token, continue without auth
    next();
  }
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

export const authRouter = Router();

// Register endpoint
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);

    // Check if user exists
    const { rows: existingUsers } = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUsers.length > 0) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const { rows } = await query<{ id: string; email: string; plan: string; name: string }>(
      `INSERT INTO users (name, email, password_hash, plan)
       VALUES ($1, $2, $3, 'free')
       RETURNING id, name, email, plan`,
      [name || null, email, passwordHash]
    );

    appendToSqlFile(name || null, email);

    const user = rows[0];

    // Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      plan: user.plan,
    });

    setAuthCookie(res, token);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan as 'free' | 'premium',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const { rows } = await query<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      plan: string;
    }>('SELECT id, name, email, password_hash, plan FROM users WHERE email = $1', [email]);

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      plan: user.plan,
    });

    setAuthCookie(res, token);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan as 'free' | 'premium',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
authRouter.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// Get current user endpoint
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Get fresh user data including subscription info
    const { rows } = await query<{
      id: string;
      name: string;
      email: string;
      plan: string;
    }>('SELECT id, name, email, plan FROM users WHERE id = $1', [req.user.id]);

    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = rows[0];

    // Get subscription status
    const { rows: subRows } = await query<{
      status: string;
      current_period_end: Date | null;
    }>(
      `SELECT status, current_period_end FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan as 'free' | 'premium',
        subscription: subRows.length > 0 ? {
          status: subRows[0].status,
          currentPeriodEnd: subRows[0].current_period_end,
        } : null,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

import axios from 'axios';

// ─── Real Google OAuth Flow ──────────────────────────────────────────────────

authRouter.get('/google', (_req: Request, res: Response) => {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

  if (!GOOGLE_CLIENT_ID) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5175'}/?error=google_not_configured`);
  }
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=code&scope=email profile`;
  res.redirect(url);
});

authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

  const { code } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5175'}/?error=no_code`);

  try {
    // 1. Exchange code for token
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token } = tokenRes.data;

    // 2. Fetch user profile
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { email, name: googleName, id: googleId } = userRes.data;

    // 3. Upsert user in database
    let { rows } = await query('SELECT id, email, plan FROM users WHERE google_id = $1 OR email = $2 LIMIT 1', [googleId, email]);

    if (rows.length === 0) {
      const result = await query(
        `INSERT INTO users (name, email, google_id, plan) VALUES ($1, $2, $3, 'free') RETURNING id, email, plan`,
        [googleName || 'Google User', email, googleId]
      );
      rows = result.rows;
      appendToSqlFile(googleName || 'Google User', email);
    } else {
      // If user exists but google_id is null, link it
      await query('UPDATE users SET google_id = $1 WHERE email = $2', [googleId, email]);
    }

    const user = rows[0];
    const token = generateToken({ id: user.id, email: user.email, plan: user.plan });
    setAuthCookie(res, token);
    
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5175/');
  } catch (err) {
    console.error('Google OAuth Error:', err);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5175'}/?error=google_auth_failed`);
  }
});

// ─── Real GitHub OAuth Flow ──────────────────────────────────────────────────

authRouter.get('/github', (_req: Request, res: Response) => {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';

  if (!GITHUB_CLIENT_ID) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5175'}/?error=github_not_configured`);
  }
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user:email`;
  res.redirect(url);
});

authRouter.get('/github/callback', async (req: Request, res: Response) => {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

  const { code } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5175'}/?error=no_code`);

  try {
    // 1. Exchange code for token
    const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }, { headers: { Accept: 'application/json' } });

    const { access_token } = tokenRes.data;

    // 2. Fetch user profile and emails
    const [userRes, emailRes] = await Promise.all([
      axios.get('https://api.github.com/user', { headers: { Authorization: `Bearer ${access_token}` } }),
      axios.get('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${access_token}` } })
    ]);

    const githubName = userRes.data.name || userRes.data.login;
    const githubId = String(userRes.data.id);
    const primaryEmailObj = emailRes.data.find((e: any) => e.primary) || emailRes.data[0];
    const email = primaryEmailObj?.email;

    if (!email) throw new Error('No email found from GitHub');

    // 3. Upsert user in database
    let { rows } = await query('SELECT id, email, plan FROM users WHERE github_id = $1 OR email = $2 LIMIT 1', [githubId, email]);

    if (rows.length === 0) {
      const result = await query(
        `INSERT INTO users (name, email, github_id, plan) VALUES ($1, $2, $3, 'free') RETURNING id, email, plan`,
        [githubName || 'GitHub User', email, githubId]
      );
      rows = result.rows;
      appendToSqlFile(githubName || 'GitHub User', email);
    } else {
      // Link account
      await query('UPDATE users SET github_id = $1 WHERE email = $2', [githubId, email]);
    }

    const user = rows[0];
    const token = generateToken({ id: user.id, email: user.email, plan: user.plan });
    setAuthCookie(res, token);

    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5175/');
  } catch (err) {
    console.error('GitHub OAuth Error:', err);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5175'}/?error=github_auth_failed`);
  }
});

export default authRouter;
