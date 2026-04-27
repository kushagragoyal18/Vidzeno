import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

export interface ProgressUpdate {
  progress: number;
  time: number; // in seconds
}

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
}

export class FFmpegProcessor {
  private ffmpegPath: string;

  constructor() {
    this.ffmpegPath = ffmpegPath || 'ffmpeg';
  }

  /**
   * Get video duration in seconds
   */
  async getDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobePath = this.ffmpegPath.replace('ffmpeg', 'ffprobe');
      const args = [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputPath,
      ];

      const proc = spawn(ffprobePath || 'ffprobe', args);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe exited with code ${code}`));
          return;
        }

        try {
          const json = JSON.parse(output);
          const duration = parseFloat(json.format.duration || '0');
          resolve(duration);
        } catch (e) {
          reject(new Error('Failed to parse ffprobe output'));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Convert video with progress tracking
   */
  async convert(
    inputPath: string,
    outputPath: string,
    ffmpegArgs: string[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<ConversionResult> {
    return new Promise((resolve, reject) => {
      // Get duration first for progress calculation
      this.getDuration(inputPath)
        .then((duration) => {
          const proc = spawn(this.ffmpegPath, ffmpegArgs);
          let errorOutput = '';

          // FFmpeg outputs progress to stderr
          proc.stderr.on('data', (data) => {
            const str = data.toString();
            errorOutput += str;

            // Parse progress from FFmpeg output
            const timeMatch = str.match(/time=(\d+):(\d+):(\d+)/);
            if (timeMatch && onProgress && duration > 0) {
              const hours = parseInt(timeMatch[1]);
              const minutes = parseInt(timeMatch[2]);
              const seconds = parseInt(timeMatch[3]);
              const currentTime = hours * 3600 + minutes * 60 + seconds;
              const progress = Math.min(99, Math.round((currentTime / duration) * 100));

              onProgress({ progress, time: currentTime });
            }
          });

          proc.on('close', (code) => {
            if (code === 0 || code === null) {
              resolve({
                success: true,
                outputPath,
                duration,
              });
            } else {
              reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`));
            }
          });

          proc.on('error', (err) => {
            reject(err);
          });

          // Timeout handling
          const timeout = parseInt(process.env.FFMPEG_TIMEOUT || '600000');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
              reject(new Error('FFmpeg conversion timed out'));
            }
          }, timeout);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /**
   * Validate input file
   */
  async validate(inputPath: string): Promise<boolean> {
    try {
      await this.getDuration(inputPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const processor = new FFmpegProcessor();
