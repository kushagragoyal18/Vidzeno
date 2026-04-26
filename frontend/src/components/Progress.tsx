interface ProgressProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  errorMessage?: string | null;
}

export default function Progress({ status, progress, errorMessage }: ProgressProps) {
  if (status === 'failed') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Conversion failed</h3>
        <p className="text-sm text-gray-500 mt-2">{errorMessage || 'An error occurred'}</p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Conversion complete!</h3>
        <p className="text-sm text-gray-500 mt-2">Your file is ready for download</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">
          {status === 'pending' ? 'Waiting in queue...' : 'Converting...'}
        </span>
        <span className="text-gray-500">{progress}%</span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            status === 'processing'
              ? 'bg-primary-600'
              : 'bg-gray-400'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {status === 'processing' && (
        <div className="flex justify-center">
          <div className="animate-pulse text-sm text-gray-500">
            This may take a few minutes...
          </div>
        </div>
      )}
    </div>
  );
}
