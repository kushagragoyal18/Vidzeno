import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { upload } from '../api';
import toast from 'react-hot-toast';

interface DropZoneProps {
  onFileUploaded: (fileId: string, filename: string, size: number) => void;
  disabled?: boolean;
}

export default function DropZone({ onFileUploaded, disabled }: DropZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await upload.file(file, setUploadProgress);
      toast.success('File uploaded successfully!');
      onFileUploaded(result.fileId, result.filename, result.size);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [onFileUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': [
        '.mp4',
        '.avi',
        '.mov',
        '.mkv',
        '.webm',
        '.flv',
        '.wmv',
      ],
      'audio/mpeg': ['.mp3'],
      'image/gif': ['.gif'],
    },
    maxFiles: 1,
    disabled: disabled || uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-all duration-200 ease-in-out
        ${isDragActive
          ? 'border-primary-500 bg-primary-50 scale-[1.02]'
          : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }
        ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />

      {uploading ? (
        <div className="space-y-4">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
          <div>
            <p className="text-lg font-medium text-gray-900">Uploading...</p>
            <p className="text-sm text-gray-500 mt-1">{uploadProgress}% complete</p>
          </div>
          <div className="w-full max-w-xs mx-auto bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          {isDragActive ? (
            <div>
              <p className="text-lg font-medium text-primary-600">Drop the file here...</p>
              <p className="text-sm text-gray-500 mt-2">Release to upload</p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium text-gray-900">
                Drag & drop your video here
              </p>
              <p className="text-sm text-gray-500 mt-2">
                or click to browse (MP4, AVI, MOV, MKV, WEBM, FLV, WMV, GIF, MP3)
              </p>
              <p className="text-xs text-gray-400 mt-4">
                Max file size: 500MB (Free) / 4GB (Premium)
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
