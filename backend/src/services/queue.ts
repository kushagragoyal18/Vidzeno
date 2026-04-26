import { Queue, Job } from 'bullmq';
import Redis from 'ioredis';

export interface ConversionJobData {
  jobId: string;
  userId: string | null;
  inputFileId: string;
  inputFilename: string;
  outputFormat: string;
  watermark: boolean;
  priority: 'standard' | 'priority';
}

// In-memory job store (always available as fallback)
export const inMemoryJobs = new Map<string, {
  jobId: string;
  data: ConversionJobData;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  failedReason?: string;
  createdAt: Date;
}>();

let standardQueue: Queue | null = null;
let priorityQueue: Queue | null = null;
let redisClient: Redis | null = null;

// Attempt Redis/BullMQ initialization — silently skip if Redis is down
try {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    lazyConnect: false,
    connectTimeout: 2000,
    retryStrategy: () => null, // Don't retry
  });

  // Silence unhandled errors from the Redis client
  redisClient.on('error', () => { /* silently ignore */ });

  standardQueue = new Queue('video-conversions-standard', {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    },
  });

  priorityQueue = new Queue('video-conversions-priority', {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    },
  });

  // Silence errors on the queues too
  standardQueue.on('error', () => { /* ignore */ });
  priorityQueue.on('error', () => { /* ignore */ });

  console.log('BullMQ queues initialized (Redis mode)');
} catch {
  console.warn('⚠️  Redis not available — using in-memory job queue (upload/convert still work)');
}

// Add job to appropriate queue (falls back to in-memory if Redis is down)
export const addConversionJob = async (data: ConversionJobData): Promise<Job | null> => {
  // Always track in memory so status polling works
  inMemoryJobs.set(data.jobId, {
    jobId: data.jobId,
    data,
    status: 'pending',
    progress: 0,
    createdAt: new Date(),
  });

  if (standardQueue && priorityQueue) {
    try {
      const queue = data.priority === 'priority' ? priorityQueue : standardQueue;
      const job = await queue.add('convert-video', data, {
        jobId: data.jobId,
        priority: data.priority === 'priority' ? 10 : 1,
      });
      return job;
    } catch {
      // Redis write failed — in-memory tracking is the fallback
    }
  }

  return null;
};

// Get job status — checks in-memory first, then Redis
export const getJobStatus = async (jobId: string): Promise<{
  status: string;
  progress: number;
  failedReason?: string;
} | null> => {
  const memJob = inMemoryJobs.get(jobId);
  if (memJob) {
    return { status: memJob.status, progress: memJob.progress, failedReason: memJob.failedReason };
  }

  if (standardQueue && priorityQueue) {
    for (const queue of [standardQueue, priorityQueue]) {
      try {
        const job = await queue.getJob(jobId);
        if (job) {
          return {
            status: await job.getState(),
            progress: typeof job.progress === 'number' ? job.progress : 0,
            failedReason: job.failedReason,
          };
        }
      } catch { /* ignore */ }
    }
  }

  return null;
};

export const cleanupOldJobs = async () => {
  if (standardQueue && priorityQueue) {
    try {
      await standardQueue.clean(0, 1000, 'completed');
      await standardQueue.clean(0, 1000, 'failed');
      await priorityQueue.clean(0, 1000, 'completed');
      await priorityQueue.clean(0, 1000, 'failed');
    } catch { /* ignore */ }
  }
};

export const closeQueues = async () => {
  try {
    if (standardQueue) await standardQueue.close();
    if (priorityQueue) await priorityQueue.close();
    if (redisClient) await redisClient.quit();
  } catch { /* ignore */ }
};

export { redisClient as connection };
