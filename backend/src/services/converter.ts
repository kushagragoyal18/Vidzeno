/**
 * Direct FFmpeg conversion service.
 * Runs conversions in-process using ffmpeg-static — no Redis/worker needed.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from 'ffmpeg-static';
import { inMemoryJobs } from './queue';

// ─── Format configs (mirrors worker/src/formats.ts) ──────────────────────────

interface FormatConfig {
  extension: string;
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  additionalArgs?: string[];
  noVideo?: boolean;
}

const OUTPUT_FORMATS: Record<string, FormatConfig> = {
  mp4:  { extension: 'mp4',  videoCodec: 'libx264', audioCodec: 'aac',       videoBitrate: '2000k', audioBitrate: '128k', additionalArgs: ['-movflags', 'faststart', '-pix_fmt', 'yuv420p'] },
  avi:  { extension: 'avi',  videoCodec: 'mpeg4',   audioCodec: 'mp3',       videoBitrate: '2000k', audioBitrate: '128k' },
  mov:  { extension: 'mov',  videoCodec: 'libx264', audioCodec: 'aac',       videoBitrate: '2000k', audioBitrate: '128k', additionalArgs: ['-pix_fmt', 'yuv420p'] },
  mkv:  { extension: 'mkv',  videoCodec: 'libx264', audioCodec: 'aac',       videoBitrate: '2000k', audioBitrate: '128k' },
  webm: { extension: 'webm', videoCodec: 'libvpx-vp9', audioCodec: 'libopus', videoBitrate: '1500k', audioBitrate: '128k' },
  gif:  { extension: 'gif',  videoCodec: 'gif',                               additionalArgs: ['-vf', 'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'] },
  mp3:  { extension: 'mp3',  audioCodec: 'libmp3lame', audioBitrate: '192k',  additionalArgs: ['-vn'], noVideo: true },
};

function buildFFmpegArgs(inputPath: string, outputPath: string, outputFormat: string, watermark: boolean): string[] {
  const fmt = OUTPUT_FORMATS[outputFormat];
  if (!fmt) throw new Error(`Unsupported format: ${outputFormat}`);

  const args = ['-i', inputPath, '-y'];

  if (!fmt.noVideo) {
    args.push('-c:v', fmt.videoCodec || 'libx264');
    if (fmt.videoBitrate) args.push('-b:v', fmt.videoBitrate);
  }

  if (fmt.audioCodec) {
    args.push('-c:a', fmt.audioCodec);
    if (fmt.audioBitrate) args.push('-b:a', fmt.audioBitrate);
  }

  // Watermark for free-tier (skip for gif/mp3)
  if (watermark && outputFormat !== 'gif' && outputFormat !== 'mp3') {
    const text = process.env.FFMPEG_WATERMARK_TEXT || 'Vidzeno Free';
    args.push('-vf', `drawtext=text='${text}':fontsize=24:fontcolor=white@0.5:x=w-tw-10:y=h-th-10`);
  }

  if (fmt.additionalArgs) args.push(...fmt.additionalArgs);

  args.push(outputPath);
  return args;
}

// ─── Main conversion function ─────────────────────────────────────────────────

export async function runConversion(jobId: string, inputFilePath: string, outputFormat: string, watermark: boolean): Promise<void> {
  const job = inMemoryJobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found in memory`);

  // Mark as processing
  job.status = 'processing';
  job.progress = 0;

  const outputDir = process.env.OUTPUT_DIR || './outputs';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputFileId = uuidv4();
  const ext = OUTPUT_FORMATS[outputFormat]?.extension || outputFormat;
  const outputFilename = `${outputFileId}.${ext}`;
  const outputPath = path.join(outputDir, outputFilename);

  const args = buildFFmpegArgs(inputFilePath, outputPath, outputFormat, watermark);
  let duration = 0; // We'll extract this from FFmpeg output

  console.log(`▶️  Starting FFmpeg conversion for job ${jobId}`);
  console.log(`   Input:  ${inputFilePath}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Args:   ffmpeg ${args.join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath || 'ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // 1. Try to extract duration if we don't have it yet
      if (duration === 0) {
        const durationMatch = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          duration = hours * 3600 + minutes * 60 + seconds;
          console.log(`⏱️ Detected duration for job ${jobId}: ${duration}s`);
        }
      }

      // 2. Extract progress updates
      if (duration > 0) {
        // matchAll for time=HH:MM:SS.ms to get the latest time in this chunk
        const matches = [...chunk.matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
        if (matches.length > 0) {
          const m = matches[matches.length - 1]; // last match
          const elapsed = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
          
          let pct = Math.round((elapsed / duration) * 100);
          pct = Math.max(0, Math.min(99, pct)); // Keep between 0-99 while running
          
          if (pct > job.progress) {
            job.progress = pct;
          }
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0 || code === null) {
        job.status = 'completed';
        job.progress = 100;
        // Attach output info to job so download route can serve it
        (job as any).outputFileId = outputFileId;
        (job as any).outputFilename = outputFilename;
        (job as any).outputPath = outputPath;
        console.log(`✅ Conversion complete for job ${jobId} → ${outputFilename}`);
        resolve();
      } else {
        job.status = 'failed';
        job.failedReason = `FFmpeg exited with code ${code}`;
        console.error(`❌ Conversion failed for job ${jobId}:\n${stderr.slice(-500)}`);
        reject(new Error(job.failedReason));
      }
    });

    ffmpeg.on('error', (err) => {
      job.status = 'failed';
      job.failedReason = err.message;
      reject(err);
    });

    // Safety timeout
    const timeout = parseInt(process.env.FFMPEG_TIMEOUT || '600000');
    const timer = setTimeout(() => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGKILL');
        job.status = 'failed';
        job.failedReason = 'Conversion timed out';
        reject(new Error('FFmpeg timed out'));
      }
    }, timeout);

    ffmpeg.on('close', () => clearTimeout(timer));
  });
}
