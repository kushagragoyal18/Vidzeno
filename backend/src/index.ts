import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Import routes
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import convertRouter from './routes/convert';
import downloadRouter from './routes/download';
import paymentsRouter from './routes/payments';
import webhooksRouter from './routes/webhooks';
import usersRouter from './routes/users';
import contentRouter from './routes/content';

// Import database
import { getPool } from './db/index';

// Import services
import { runCleanupJob } from './services/cleanup';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['set-cookie'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/convert', convertRouter);
app.use('/api/download', downloadRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/users', usersRouter);
app.use('/api/content', contentRouter);

// API info endpoint
app.get('/api', (_req, res) => {
  res.json({
    name: 'Vidzeno API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
      },
      upload: {
        upload: 'POST /api/upload',
        status: 'GET /api/upload/:fileId',
      },
      convert: {
        convert: 'POST /api/convert',
        jobStatus: 'GET /api/convert/job/:jobId',
        formats: 'GET /api/convert/formats',
      },
      download: {
        download: 'GET /api/download/:fileId',
      },
      payments: {
        checkout: 'POST /api/payments/create-checkout-session',
        subscription: 'GET /api/payments/subscription',
        portal: 'POST /api/payments/create-portal-session',
      },
      content: {
        faq: 'GET /api/content/faq',
        contact: 'POST /api/content/contact',
      },
    },
  });
});

// Serve frontend in production
const frontendPath = path.join(process.cwd(), '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  // Multer errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large' });
      return;
    }
    res.status(400).json({ error: 'Upload error' });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Start server
import { createTables } from './db/schema';

const startServer = async () => {
  // Initialize embedded PGlite database
  try {
    const pool = getPool();
    // PGlite needs to be ready, but await on query naturally waits
    await createTables(pool);
    console.log('✅ Database connected and initialized');
  } catch (error) {
    console.error('⚠️  Failed to initialize database:', error);
  }

  app.listen(PORT, () => {
    console.log(`Vidzeno API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Start background file cleanup (runs immediately, then every hour)
    runCleanupJob();
    setInterval(runCleanupJob, 60 * 60 * 1000);
  });
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();

export default app;
