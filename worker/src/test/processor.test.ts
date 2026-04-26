import { FFmpegProcessor } from '../processor';

// Mock child_process.spawn so tests never touch ffmpeg binary
jest.mock('child_process', () => {
  const { EventEmitter } = require('events');

  const makeProc = (
    stdoutData: string,
    stderrData: string,
    exitCode: number
  ) => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.killed = false;
    proc.kill = jest.fn(() => { proc.killed = true; });

    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from(stdoutData));
      proc.stderr.emit('data', Buffer.from(stderrData));
      proc.emit('close', exitCode);
    });

    return proc;
  };

  return {
    spawn: jest.fn((_cmd: string, args: string[]) => {
      // ffprobe call: return a minimal JSON with duration
      if (args.includes('-show_format')) {
        return makeProc(
          JSON.stringify({ format: { duration: '10.0' }, streams: [] }),
          '',
          0
        );
      }
      // ffmpeg call: emit a progress line then exit
      return makeProc(
        '',
        'frame=100 fps=30 time=00:00:05 bitrate=2000.0kbits/s',
        0
      );
    }),
  };
});

describe('FFmpegProcessor', () => {
  let processor: FFmpegProcessor;

  beforeEach(() => {
    processor = new FFmpegProcessor();
    jest.clearAllMocks();
  });

  // ── getDuration ──────────────────────────────────────────────

  describe('getDuration', () => {
    it('returns the parsed duration from ffprobe JSON', async () => {
      const duration = await processor.getDuration('/tmp/test.mp4');
      expect(duration).toBe(10);
    });

    it('rejects when ffprobe exits with non-zero code', async () => {
      const { spawn } = require('child_process') as { spawn: jest.Mock };
      const { EventEmitter } = require('events');

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = jest.fn();

      spawn.mockImplementationOnce(() => {
        setImmediate(() => proc.emit('close', 1));
        return proc;
      });

      await expect(processor.getDuration('/bad/path.mp4')).rejects.toThrow(
        /ffprobe exited/
      );
    });
  });

  // ── validate ─────────────────────────────────────────────────

  describe('validate', () => {
    it('returns true for a file that ffprobe can read', async () => {
      const result = await processor.validate('/tmp/test.mp4');
      expect(result).toBe(true);
    });

    it('returns false when ffprobe fails', async () => {
      const { spawn } = require('child_process') as { spawn: jest.Mock };
      const { EventEmitter } = require('events');

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = jest.fn();

      spawn.mockImplementationOnce(() => {
        setImmediate(() => proc.emit('close', 1));
        return proc;
      });

      const result = await processor.validate('/bad/path.mp4');
      expect(result).toBe(false);
    });
  });

  // ── convert ──────────────────────────────────────────────────

  describe('convert', () => {
    const args = [
      '-i', '/tmp/input.mp4',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '/tmp/output.mp4',
    ];

    it('resolves with success=true on zero exit code', async () => {
      const result = await processor.convert('/tmp/input.mp4', '/tmp/output.mp4', args);
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/tmp/output.mp4');
      expect(result.duration).toBe(10);
    });

    it('calls the onProgress callback with parsed progress', async () => {
      const onProgress = jest.fn();
      await processor.convert('/tmp/input.mp4', '/tmp/output.mp4', args, onProgress);
      // Progress callback should have been called at least once
      expect(onProgress).toHaveBeenCalled();
      const call = onProgress.mock.calls[0][0];
      expect(call).toHaveProperty('progress');
      expect(call.progress).toBeGreaterThanOrEqual(0);
      expect(call.progress).toBeLessThanOrEqual(100);
    });

    it('rejects when ffmpeg exits with non-zero code', async () => {
      const { spawn } = require('child_process') as { spawn: jest.Mock };
      const { EventEmitter } = require('events');

      // First spawn = ffprobe (success), second = ffmpeg (fail)
      spawn
        .mockImplementationOnce((_cmd: string, spawnArgs: string[]) => {
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.killed = false;
          proc.kill = jest.fn();
          setImmediate(() => {
            proc.stdout.emit('data', Buffer.from(JSON.stringify({ format: { duration: '5' }, streams: [] })));
            proc.emit('close', 0);
          });
          return proc;
        })
        .mockImplementationOnce(() => {
          const proc = new EventEmitter() as any;
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.killed = false;
          proc.kill = jest.fn();
          setImmediate(() => {
            proc.stderr.emit('data', Buffer.from('error: invalid codec'));
            proc.emit('close', 1);
          });
          return proc;
        });

      await expect(
        processor.convert('/tmp/input.mp4', '/tmp/output.mp4', args)
      ).rejects.toThrow(/FFmpeg exited/);
    });
  });
});
