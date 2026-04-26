import fs from 'fs';
import path from 'path';

// How old a file must be to be deleted (24 hours in milliseconds)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const OUTPUTS_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'outputs');

/**
 * Scans the provided directory and deletes files older than MAX_AGE_MS.
 */
function cleanDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) return;

  const now = Date.now();
  let deletedCount = 0;

  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      // Skip hidden files like .gitkeep
      if (file.startsWith('.')) continue;

      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        const age = now - stats.mtimeMs;
        if (age > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Cleanup: Deleted ${deletedCount} old file(s) from ${path.basename(dirPath)}`);
    }
  } catch (error) {
    console.error(`❌ Cleanup Error reading directory ${dirPath}:`, error);
  }
}

/**
 * Runs the cleanup job on both uploads and outputs directories.
 */
export function runCleanupJob() {
  console.log('🔄 Running scheduled file cleanup job...');
  cleanDirectory(UPLOADS_DIR);
  cleanDirectory(OUTPUTS_DIR);
}
