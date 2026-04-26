// Format conversion mappings for FFmpeg

export interface FormatConfig {
  extension: string;
  videoCodec?: string;
  audioCodec?: string;
  container: string;
  videoBitrate?: string;
  audioBitrate?: string;
  additionalArgs?: string[];
}

export const OUTPUT_FORMATS: Record<string, FormatConfig> = {
  mp4: {
    extension: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    container: 'mp4',
    videoBitrate: '2000k',
    audioBitrate: '128k',
    additionalArgs: ['-movflags', 'faststart', '-pix_fmt', 'yuv420p'],
  },
  avi: {
    extension: 'avi',
    videoCodec: 'mpeg4',
    audioCodec: 'mp3',
    container: 'avi',
    videoBitrate: '2000k',
    audioBitrate: '128k',
  },
  mov: {
    extension: 'mov',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    container: 'mov',
    videoBitrate: '2000k',
    audioBitrate: '128k',
    additionalArgs: ['-pix_fmt', 'yuv420p'],
  },
  mkv: {
    extension: 'mkv',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    container: 'mkv',
    videoBitrate: '2000k',
    audioBitrate: '128k',
  },
  webm: {
    extension: 'webm',
    videoCodec: 'libvpx-vp9',
    audioCodec: 'libopus',
    container: 'webm',
    videoBitrate: '1500k',
    audioBitrate: '128k',
  },
  gif: {
    extension: 'gif',
    videoCodec: 'gif',
    container: 'gif',
    additionalArgs: [
      '-vf',
      'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    ],
  },
  mp3: {
    extension: 'mp3',
    audioCodec: 'libmp3lame',
    container: 'mp3',
    audioBitrate: '192k',
    additionalArgs: ['-vn'], // No video
  },
};

// Input format validation
export const SUPPORTED_INPUT_EXTENSIONS = new Set([
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.webm',
  '.flv',
  '.wmv',
  '.gif',
  '.mp3',
  '.m4v',
  '.3gp',
  '.ts',
  '.mts',
  '.m2ts',
]);

// Get FFmpeg arguments for a given output format
export const getFFmpegArgs = (
  inputPath: string,
  outputPath: string,
  outputFormat: string,
  watermark?: boolean
): string[] => {
  const format = OUTPUT_FORMATS[outputFormat];

  if (!format) {
    throw new Error(`Unsupported output format: ${outputFormat}`);
  }

  const args: string[] = ['-i', inputPath, '-y']; // -y to overwrite output

  // Add format-specific arguments
  if (format.videoCodec) {
    args.push('-c:v', format.videoCodec);
  } else {
    args.push('-c:v', 'libx264'); // Default to h264
  }

  if (format.audioCodec) {
    args.push('-c:a', format.audioCodec);
  }

  if (format.videoBitrate) {
    args.push('-b:v', format.videoBitrate);
  }

  if (format.audioBitrate) {
    args.push('-b:a', format.audioBitrate);
  }

  // Add watermark for free tier
  if (watermark && outputFormat !== 'gif' && outputFormat !== 'mp3') {
    const watermarkText = process.env.FFMPEG_WATERMARK_TEXT || 'VideoShift Free';
    const watermarkFilter = `drawtext=text='${watermarkText}':fontsize=24:fontcolor=white@0.5:x=w-tw-10:y=h-th-10`;

    if (format.additionalArgs && format.additionalArgs.includes('-vf')) {
      // Merge with existing video filter
      const existingVfIndex = format.additionalArgs.indexOf('-vf');
      if (existingVfIndex !== -1 && format.additionalArgs[existingVfIndex + 1]) {
        const existingFilter = format.additionalArgs[existingVfIndex + 1];
        format.additionalArgs[existingVfIndex + 1] = `${existingFilter},${watermarkFilter}`;
      }
    } else {
      args.push('-vf', watermarkFilter);
    }
  }

  // Add any additional format-specific arguments
  if (format.additionalArgs) {
    args.push(...format.additionalArgs);
  }

  // Output path
  args.push(outputPath);

  return args;
};
