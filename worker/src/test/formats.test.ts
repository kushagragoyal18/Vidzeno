import { OUTPUT_FORMATS, getFFmpegArgs, SUPPORTED_INPUT_EXTENSIONS } from '../formats';

describe('Worker format config', () => {
  // ── OUTPUT_FORMATS ───────────────────────────────────────────

  describe('OUTPUT_FORMATS', () => {
    const defined = Object.keys(OUTPUT_FORMATS);
    const expected = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', 'mp3'];

    it('defines all expected output formats', () => {
      expected.forEach((fmt) => expect(defined).toContain(fmt));
    });

    it('every format has an extension and container', () => {
      defined.forEach((fmt) => {
        expect(OUTPUT_FORMATS[fmt].extension).toBeTruthy();
        expect(OUTPUT_FORMATS[fmt].container).toBeTruthy();
      });
    });

    it('mp3 has no videoCodec (audio-only)', () => {
      expect(OUTPUT_FORMATS['mp3'].videoCodec).toBeUndefined();
    });

    it('mp3 includes -vn in additionalArgs', () => {
      expect(OUTPUT_FORMATS['mp3'].additionalArgs).toContain('-vn');
    });

    it('gif has a palette-based video filter', () => {
      const args = OUTPUT_FORMATS['gif'].additionalArgs;
      expect(args).toBeDefined();
      expect(args!.join(' ')).toMatch(/palettegen/);
    });

    it('mp4 includes faststart flag for streaming', () => {
      const args = OUTPUT_FORMATS['mp4'].additionalArgs;
      expect(args).toContain('faststart');
    });
  });

  // ── SUPPORTED_INPUT_EXTENSIONS ────────────────────────────────

  describe('SUPPORTED_INPUT_EXTENSIONS', () => {
    const common = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.gif', '.mp3'];

    it.each(common)('includes common format %s', (ext) => {
      expect(SUPPORTED_INPUT_EXTENSIONS.has(ext)).toBe(true);
    });

    it.each(['.exe', '.pdf', '.docx'])('excludes non-video %s', (ext) => {
      expect(SUPPORTED_INPUT_EXTENSIONS.has(ext)).toBe(false);
    });
  });

  // ── getFFmpegArgs ─────────────────────────────────────────────

  describe('getFFmpegArgs', () => {
    const input = '/tmp/input.mp4';
    const output = '/tmp/output.mp4';

    it('throws for unsupported format', () => {
      expect(() => getFFmpegArgs(input, output, 'xyz')).toThrow(/Unsupported output format/);
    });

    it('always starts with -i <input>', () => {
      const args = getFFmpegArgs(input, output, 'mp4');
      expect(args[0]).toBe('-i');
      expect(args[1]).toBe(input);
    });

    it('always ends with the output path', () => {
      const args = getFFmpegArgs(input, output, 'mp4');
      expect(args[args.length - 1]).toBe(output);
    });

    it('includes -y to overwrite output', () => {
      const args = getFFmpegArgs(input, output, 'mp4');
      expect(args).toContain('-y');
    });

    it('mp4: uses libx264 video codec', () => {
      const args = getFFmpegArgs(input, output, 'mp4');
      const idx = args.indexOf('-c:v');
      expect(idx).toBeGreaterThan(-1);
      expect(args[idx + 1]).toBe('libx264');
    });

    it('mp3: includes -vn (no video stream)', () => {
      const args = getFFmpegArgs(input, '/tmp/output.mp3', 'mp3');
      expect(args).toContain('-vn');
    });

    it('webm: uses libvpx-vp9 video codec', () => {
      const args = getFFmpegArgs(input, '/tmp/output.webm', 'webm');
      const idx = args.indexOf('-c:v');
      expect(args[idx + 1]).toBe('libvpx-vp9');
    });

    it('adds watermark drawtext filter for non-gif, non-mp3 formats', () => {
      const args = getFFmpegArgs(input, output, 'mp4', true);
      const joined = args.join(' ');
      expect(joined).toMatch(/drawtext/);
    });

    it('does NOT add watermark filter for mp3', () => {
      const args = getFFmpegArgs(input, '/tmp/output.mp3', 'mp3', true);
      expect(args.join(' ')).not.toMatch(/drawtext/);
    });

    it('does NOT add watermark filter for gif', () => {
      const args = getFFmpegArgs(input, '/tmp/output.gif', 'gif', true);
      expect(args.join(' ')).not.toMatch(/drawtext/);
    });

    it('skips watermark when flag is false', () => {
      const args = getFFmpegArgs(input, output, 'mp4', false);
      expect(args.join(' ')).not.toMatch(/drawtext/);
    });

    it.each(['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', 'mp3'])(
      'generates valid args for %s without throwing',
      (fmt) => {
        expect(() =>
          getFFmpegArgs(input, `/tmp/output.${fmt}`, fmt)
        ).not.toThrow();
      }
    );
  });
});
