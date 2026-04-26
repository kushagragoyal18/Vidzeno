import multer from 'multer';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Supported video formats
export const ALLOWED_MIME_TYPES = new Map<string, string[]>([
  ['video/mp4', ['.mp4']],
  ['video/x-msvideo', ['.avi']],
  ['video/quicktime', ['.mov']],
  ['video/x-matroska', ['.mkv']],
  ['video/webm', ['.webm']],
  ['video/x-flv', ['.flv']],
  ['video/x-ms-wmv', ['.wmv']],
  ['video/gif', ['.gif']],
  ['audio/mpeg', ['.mp3']],
  ['audio/mp3', ['.mp3']],
]);

export const ALLOWED_EXTENSIONS = new Set([
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.webm',
  '.flv',
  '.wmv',
  '.gif',
  '.mp3',
]);

// Get upload directory
const getUploadDir = (): string => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = getUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uuid = uuidv4();
    cb(null, `${uuid}${ext}`);
  },
});

// File filter
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check extension
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const error = new Error(`Unsupported file format: ${ext}`);
    (error as any).code = 'UNSUPPORTED_FORMAT';
    cb(error);
    return;
  }

  // Check MIME type (be lenient if MIME type is not reliable)
  if (
    file.mimetype &&
    !Array.from(ALLOWED_MIME_TYPES.keys()).some((type) => {
      if (file.mimetype.startsWith(type.split('/')[0])) {
        return true;
      }
      return file.mimetype === type;
    })
  ) {
    // Log warning but allow if extension is valid
    console.warn(`MIME type mismatch: ${file.mimetype} for ${file.originalname}`);
  }

  cb(null, true);
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024 * 1024, // 4GB max (will be validated per-user later)
    files: 1,
  },
});

// Validate file size based on user plan
export const validateFileSize = (
  fileSize: number,
  isPremium: boolean
): { valid: boolean; error?: string } => {
  const maxFree = parseInt(process.env.MAX_FILE_SIZE_FREE || '524288000'); // 500MB
  const maxPremium = parseInt(process.env.MAX_FILE_SIZE_PREMIUM || '4294967296'); // 4GB

  const limit = isPremium ? maxPremium : maxFree;

  if (fileSize > limit) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${isPremium ? '4GB' : '500MB'}`,
    };
  }

  return { valid: true };
};

// Get file size limit for user
export const getFileSizeLimit = (isPremium: boolean): number => {
  return isPremium
    ? parseInt(process.env.MAX_FILE_SIZE_PREMIUM || '4294967296')
    : parseInt(process.env.MAX_FILE_SIZE_FREE || '524288000');
};

// Format bytes to human readable
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};
