import { validateFileSize, formatFileSize, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES } from '../middleware/upload';

describe('Upload middleware', () => {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  // ── validateFileSize ─────────────────────────────────────────

  describe('validateFileSize', () => {
    describe('free plan', () => {
      it('accepts a file well under the 500 MB limit', () => {
        expect(validateFileSize(100 * MB, false).valid).toBe(true);
      });

      it('accepts a file exactly at the 500 MB limit', () => {
        expect(validateFileSize(500 * MB, false).valid).toBe(true);
      });

      it('rejects a file one byte over the 500 MB limit', () => {
        const result = validateFileSize(500 * MB + 1, false);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/File too large/i);
        expect(result.error).toMatch(/500MB/i);
      });

      it('rejects a 600 MB file', () => {
        const result = validateFileSize(600 * MB, false);
        expect(result.valid).toBe(false);
      });
    });

    describe('premium plan', () => {
      it('accepts a 3 GB file', () => {
        expect(validateFileSize(3 * GB, true).valid).toBe(true);
      });

      it('accepts a file exactly at the 4 GB limit', () => {
        expect(validateFileSize(4 * GB, true).valid).toBe(true);
      });

      it('rejects a file over the 4 GB limit', () => {
        const result = validateFileSize(5 * GB, true);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/4GB/i);
      });
    });

    it('returns no error message on success', () => {
      const result = validateFileSize(1 * MB, false);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // ── formatFileSize ───────────────────────────────────────────

  describe('formatFileSize', () => {
    it('formats 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('formats bytes', () => {
      expect(formatFileSize(512)).toBe('512 Bytes');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(5 * MB)).toBe('5 MB');
    });

    it('formats gigabytes', () => {
      expect(formatFileSize(2 * GB)).toBe('2 GB');
    });
  });

  // ── ALLOWED_EXTENSIONS ───────────────────────────────────────

  describe('ALLOWED_EXTENSIONS', () => {
    const supported = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.gif', '.mp3'];

    it.each(supported)('includes %s', (ext) => {
      expect(ALLOWED_EXTENSIONS.has(ext)).toBe(true);
    });

    it.each(['.exe', '.pdf', '.docx', '.zip', '.mp5'])('excludes %s', (ext) => {
      expect(ALLOWED_EXTENSIONS.has(ext)).toBe(false);
    });
  });

  // ── ALLOWED_MIME_TYPES ───────────────────────────────────────

  describe('ALLOWED_MIME_TYPES', () => {
    it('has at least one entry per major video category', () => {
      const keys = Array.from(ALLOWED_MIME_TYPES.keys());
      expect(keys.some((k) => k.startsWith('video/'))).toBe(true);
      expect(keys.some((k) => k.startsWith('audio/'))).toBe(true);
    });

    it('maps video/mp4 to [.mp4]', () => {
      expect(ALLOWED_MIME_TYPES.get('video/mp4')).toEqual(['.mp4']);
    });

    it('maps audio/mpeg to [.mp3]', () => {
      expect(ALLOWED_MIME_TYPES.get('audio/mpeg')).toEqual(['.mp3']);
    });
  });
});
