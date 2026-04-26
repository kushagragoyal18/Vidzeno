import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { processor } from './processor';
import { getFFmpegArgs, OUTPUT_FORMATS } from './formats';

const getRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return redisUrl;
};

const getPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
};

const getUploadDir = () => process.env.UPLOAD_DIR || './uploads';
const getOutputDir = () => process.env.OUTPUT_DIR || './outputs';

// Ensure output directory exists
const ensureOutputDir = () => {
  const outputDir = getOutputDir();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
};

const connection = new Redis(getRedisConfig());

const pool = getPool();

// Worker callback for job progress
const updateJobProgress = async (jobId: string, progress: number) => {
  await pool.query(
    'UPDATE jobs SET progress = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [progress, jobId]
  );
};

const completeJob = async (
  jobId: string,
  outputFileId: string,
  outputFilename: string
) => {
  await pool.query(
    `UPDATE jobs SET
       status = 'completed',
       output_file_id = $1,
       output_filename = $2,
       progress = 100,
       completed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [outputFileId, outputFilename, jobId]
  );
};

const failJob = async (jobId: string, errorMessage: string) => {
  await pool.query(
    `UPDATE jobs SET
       status = 'failed',
       error_message = $1,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [errorMessage, jobId]
  );
};

const createOutputFileRecord = async (
  userId: string | null,
  originalFilename: string,
  storedFilename: string,
  fileSize: number,
  mimeType: string
) => {
  const fileId = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await pool.query(
    `INSERT INTO file_uploads (id, user_id, original_filename, stored_filename, file_size, mime_type, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [fileId, userId, originalFilename, storedFilename, fileSize, mimeType, expiresAt]
  );

  return fileId;
};

// Get MIME type from extension
const getMimeType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Create standard queue worker
const createWorker = (queueName: string) => {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const {
        jobId,
        userId,
        inputFileId,
        inputFilename,
        outputFormat,
        watermark,
      } = job.data;

      console.log(`Processing job ${jobId}: ${inputFilename} -> ${outputFormat}`);

      try {
        // Update job status to processing
        await pool.query(
          "UPDATE jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [jobId]
        );

        // Get input file path
        const uploadDir = getUploadDir();
        const { rows: fileRows } = await pool.query<{ stored_filename: string }>(
          'SELECT stored_filename FROM file_uploads WHERE id = $1',
          [inputFileId]
        );

        if (fileRows.length === 0) {
          throw new Error('Input file not found');
        }

        const inputFilename = fileRows[0].stored_filename;
        const inputPath = path.join(uploadDir, inputFilename);

        // Validate input file
        const isValid = await processor.validate(inputPath);
        if (!isValid) {
          throw new Error('Invalid input file');
        }

        // Generate output filename
        const outputExt = OUTPUT_FORMATS[outputFormat]?.extension || outputFormat;
        const baseName = path.basename(inputFilename, path.extname(inputFilename));
        const outputStoredFilename = `${uuidv4()}.${outputExt}`;
        const outputOriginalFilename = `${baseName}.${outputExt}`;

        // Get output path
        const outputDir = ensureOutputDir();
        const outputPath = path.join(outputDir, outputStoredFilename);

        // Get FFmpeg arguments
        const ffmpegArgs = getFFmpegArgs(inputPath, outputPath, outputFormat, watermark);

        // Run conversion
        await processor.convert(
          inputPath,
          outputPath,
          ffmpegArgs,
          async ({ progress }) => {
            await updateJobProgress(jobId, progress);
          }
        );

        // Get output file size
        const stats = fs.statSync(outputPath);

        // Create output file record
        const outputFileId = await createOutputFileRecord(
          userId,
          outputOriginalFilename,
          outputStoredFilename,
          stats.size,
          getMimeType(outputOriginalFilename)
        );

        // Mark job as completed
        await completeJob(jobId, outputFileId, outputOriginalFilename);

        console.log(`Job ${jobId} completed successfully`);
      } catch (error) {
        console.error(`Job ${jobId} failed:`, error);
        await failJob(jobId, (error as Error).message);
        throw error; // Re-throw for BullMQ retry handling
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 jobs concurrently
    }
  );

  worker.on('completed', (job: Job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    if (job) {
      console.error(`Job ${job.id} failed:`, err.message);
    }
  });

  return worker;
};

// Start workers
const startWorkers = async () => {
  console.log('Starting FFmpeg workers...');

  const standardWorker = createWorker('video-conversions-standard');
  const priorityWorker = createWorker('video-conversions-priority');

  console.log('Workers started');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down workers...');
    await standardWorker.close();
    await priorityWorker.close();
    await connection.quit();
    await pool.end();
    console.log('Workers shut down');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startWorkers().catch((err) => {
  console.error('Failed to start workers:', err);
  process.exit(1);
});
