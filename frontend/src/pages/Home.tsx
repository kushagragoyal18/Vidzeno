import { useState } from 'react';
import DropZone from '../components/DropZone';
import FormatSelector from '../components/FormatSelector';
import Progress from '../components/Progress';
import UpgradeBanner from '../components/UpgradeBanner';
import { convert } from '../api';
import toast from 'react-hot-toast';

interface JobState {
  fileId: string | null;
  filename: string;
  size: number;
  jobId: string | null;
  status: 'idle' | 'uploaded' | 'converting' | 'completed' | 'failed';
  progress: number;
  outputFormat: string;
  downloadUrl: string | null;
  errorMessage: string | null;
}

export default function Home() {
  const [job, setJob] = useState<JobState>({
    fileId: null,
    filename: '',
    size: 0,
    jobId: null,
    status: 'idle',
    progress: 0,
    outputFormat: 'mp4',
    downloadUrl: null,
    errorMessage: null,
  });

  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const handleFileUploaded = (fileId: string, filename: string, size: number) => {
    setJob((prev) => ({
      ...prev,
      fileId,
      filename,
      size,
      status: 'uploaded',
    }));
  };

  const handleStartConversion = async () => {
    if (!job.fileId) return;

    try {
      const result = await convert.start(job.fileId, job.outputFormat);
      setJob((prev) => ({
        ...prev,
        jobId: result.jobId,
        status: 'converting',
      }));

      // Start polling
      const interval = setInterval(() => {
        pollJobStatus(result.jobId);
      }, 2000);
      setPollingInterval(interval);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Conversion failed');
      setJob((prev) => ({
        ...prev,
        status: 'failed',
        errorMessage: error.response?.data?.error || 'Conversion failed',
      }));
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const result = await convert.status(jobId);

      setJob((prev) => ({
        ...prev,
        progress: result.progress,
        status:
          result.status === 'completed'
            ? 'completed'
            : result.status === 'failed'
            ? 'failed'
            : 'converting',
        downloadUrl: result.downloadUrl,
        errorMessage: result.errorMessage,
      }));

      if (result.status === 'completed' || result.status === 'failed') {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const handleDownload = () => {
    if (job.downloadUrl) {
      window.location.href = job.downloadUrl;
    }
  };

  const handleReset = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setJob({
      fileId: null,
      filename: '',
      size: 0,
      jobId: null,
      status: 'idle',
      progress: 0,
      outputFormat: 'mp4',
      downloadUrl: null,
      errorMessage: null,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Convert Videos Online
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Fast, free, and easy video converter. No software needed.
        </p>
      </div>

      {/* Main Card */}
      <div className="card">
        {job.status === 'idle' && (
          <DropZone onFileUploaded={handleFileUploaded} />
        )}

        {job.status === 'uploaded' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900">{job.filename}</p>
                  <p className="text-sm text-gray-500">{(job.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <FormatSelector
              selectedFormat={job.outputFormat}
              onSelectFormat={(format) => setJob((prev) => ({ ...prev, outputFormat: format }))}
            />

            <button onClick={handleStartConversion} className="btn-primary w-full">
              Convert Now
            </button>

            <UpgradeBanner variant="compact" />
          </div>
        )}

        {(job.status === 'converting' || job.status === 'completed' || job.status === 'failed') && (
          <div className="space-y-6">
            <Progress
              status={
                job.status === 'converting'
                  ? job.progress < 100
                    ? 'processing'
                    : 'pending'
                  : job.status
              }
              progress={job.progress}
              errorMessage={job.errorMessage}
            />

            {job.status === 'completed' && (
              <div className="flex space-x-4">
                <button onClick={handleDownload} className="btn-primary flex-1">
                  <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
                <button onClick={handleReset} className="btn-secondary">
                  Convert Another
                </button>
              </div>
            )}

            {job.status === 'failed' && (
              <button onClick={handleReset} className="btn-primary w-full">
                Try Again
              </button>
            )}
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <div className="text-center p-6">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Lightning Fast</h3>
          <p className="text-sm text-gray-600">
            Our optimized FFmpeg processing ensures quick conversions
          </p>
        </div>

        <div className="text-center p-6">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Secure & Private</h3>
          <p className="text-sm text-gray-600">
            Files are automatically deleted after 24 hours
          </p>
        </div>

        <div className="text-center p-6">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">High Quality</h3>
          <p className="text-sm text-gray-600">
            Professional-grade output with optimal compression
          </p>
        </div>
      </div>
    </div>
  );
}
