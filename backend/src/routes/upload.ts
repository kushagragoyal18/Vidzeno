import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index';
import { AuthRequest, authMiddleware } from './auth';
import { upload, validateFileSize, formatFileSize } from '../middleware/upload';

const uploadRouter = Router();

// In-memory fallback store when DB is unavailable
export const inMemoryFiles = new Map<string, {
  id: string;
  user_id: string | null;
  original_filename: string;
  stored_filename: string;
  file_size: number;
  mime_type: string;
  status: string;
  expires_at: Date;
  created_at: Date;
  file_path: string;
}>();

// Upload endpoint
uploadRouter.post(
  '/',
  authMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const user = (req as AuthRequest).user;
      const isPremium = user?.plan === 'premium';

      // Validate file size based on plan
      const validation = validateFileSize(file.size, isPremium);
      if (!validation.valid) {
        // Delete the uploaded file
        await import('fs').then((fs) => {
          fs.promises.unlink(file.path).catch(() => {});
        });
        res.status(400).json({ error: validation.error });
        return;
      }

      const fileId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Try to save to DB; fall back to in-memory if DB unavailable
      try {
        await query(
          `INSERT INTO file_uploads (id, user_id, original_filename, stored_filename, file_size, mime_type, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            fileId,
            user?.id || null,
            file.originalname,
            file.filename,
            file.size,
            file.mimetype,
            expiresAt,
          ]
        );
      } catch (_dbErr) {
        // DB not available — store in memory so the rest of the flow still works
        inMemoryFiles.set(fileId, {
          id: fileId,
          user_id: user?.id || null,
          original_filename: file.originalname,
          stored_filename: file.filename,
          file_size: file.size,
          mime_type: file.mimetype,
          status: 'uploaded',
          expires_at: expiresAt,
          created_at: new Date(),
          file_path: file.path,
        });
        console.warn(`⚠️  DB unavailable — file ${fileId} stored in memory only`);
      }

      res.json({
        fileId,
        filename: file.originalname,
        size: file.size,
        sizeFormatted: formatFileSize(file.size),
        expiresAt,
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// Get upload status
uploadRouter.get('/:fileId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    // Check in-memory fallback first
    const memFile = inMemoryFiles.get(fileId);
    if (memFile) {
      res.json({
        fileId: memFile.id,
        filename: memFile.original_filename,
        size: memFile.file_size,
        mimeType: memFile.mime_type,
        status: memFile.status,
        createdAt: memFile.created_at,
        expiresAt: memFile.expires_at,
      });
      return;
    }

    const { rows } = await query<{
      id: string;
      original_filename: string;
      file_size: number;
      mime_type: string;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>('SELECT * FROM file_uploads WHERE id = $1', [fileId]);

    if (rows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = rows[0];
    res.json({
      fileId: file.id,
      filename: file.original_filename,
      size: file.file_size,
      mimeType: file.mime_type,
      status: file.status,
      createdAt: file.created_at,
      expiresAt: file.expires_at,
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

export default uploadRouter;
