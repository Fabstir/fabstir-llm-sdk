interface FileUploadProgressProps {
  currentFile: string;
  filesProcessed: number;
  totalFiles: number;
  status: 'reading' | 'complete' | 'error';
  error?: string;
}

/**
 * FileUploadProgress - Visual indicator for file upload/processing
 *
 * Shows progress when files are being read and processed before sending to AI
 */
export function FileUploadProgress({
  currentFile,
  filesProcessed,
  totalFiles,
  status,
  error,
}: FileUploadProgressProps) {
  if (status === 'complete') {
    return null; // Don't show anything when complete
  }

  return (
    <div className="border-t border-gray-200 bg-blue-50 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Spinner */}
        {status === 'reading' && (
          <div className="flex-shrink-0">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Error Icon */}
        {status === 'error' && (
          <div className="flex-shrink-0">
            <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600 text-xs font-bold">!</span>
            </div>
          </div>
        )}

        {/* Status Text */}
        <div className="flex-1 min-w-0">
          {status === 'reading' && (
            <>
              <p className="text-sm font-medium text-blue-900">
                Processing file {filesProcessed + 1} of {totalFiles}
              </p>
              <p className="text-xs text-blue-700 truncate">
                {currentFile}
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <p className="text-sm font-medium text-red-900">
                File upload failed
              </p>
              <p className="text-xs text-red-700">
                {error || 'Unknown error occurred'}
              </p>
            </>
          )}
        </div>

        {/* Progress Counter */}
        {status === 'reading' && (
          <div className="flex-shrink-0 text-xs font-medium text-blue-600">
            {filesProcessed}/{totalFiles}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {status === 'reading' && totalFiles > 1 && (
        <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${(filesProcessed / totalFiles) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
