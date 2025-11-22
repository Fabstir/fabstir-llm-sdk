'use client';

import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { EmbeddingProgress } from '@/hooks/use-vector-databases';
import { cn } from '@/lib/utils';

export interface EmbeddingProgressBarProps {
  progress: EmbeddingProgress | null;
  queueSize?: number; // Total documents in queue
  queuePosition?: number; // Current position in queue (1-indexed)
  remainingDocuments?: string[]; // List of remaining document names
  estimatedTimeRemaining?: number; // Seconds
}

/**
 * Embedding Progress Bar Component
 *
 * Shows real-time progress of background embedding generation:
 * - Current document being processed
 * - Progress percentage and chunk count
 * - Queue information (X of Y documents)
 * - Remaining documents list
 * - Estimated time remaining
 */
export function EmbeddingProgressBar({
  progress,
  queueSize,
  queuePosition,
  remainingDocuments = [],
  estimatedTimeRemaining,
}: EmbeddingProgressBarProps) {
  if (!progress) return null;

  const isProcessing = progress.status === 'processing';
  const isComplete = progress.status === 'complete';
  const isFailed = progress.status === 'failed';

  // Status icon
  const StatusIcon = isProcessing
    ? Loader2
    : isComplete
    ? CheckCircle
    : isFailed
    ? XCircle
    : Clock;

  const iconClassName = isProcessing
    ? 'animate-spin text-blue-600'
    : isComplete
    ? 'text-green-600'
    : isFailed
    ? 'text-red-600'
    : 'text-gray-600';

  // Progress bar color
  const progressIndicatorColor = isFailed
    ? 'bg-red-600'
    : isComplete
    ? 'bg-green-600'
    : 'bg-blue-600';

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <StatusIcon className={cn('h-5 w-5', iconClassName)} />
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">
            {queueSize && queuePosition ? (
              <>🔄 Vectorizing Documents ({queuePosition} of {queueSize})</>
            ) : (
              <>🔄 Vectorizing Document</>
            )}
          </h4>
        </div>
      </div>

      {/* Current document */}
      <div className="mb-2">
        <p className="text-sm text-gray-600">
          Current: <span className="font-medium text-gray-900">{progress.fileName}</span>
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <Progress
          value={progress.percentage}
          className="h-3"
          indicatorClassName={progressIndicatorColor}
        />
        <p className="text-xs text-gray-500 mt-1">
          {Math.round(progress.percentage)}% (
          {progress.processedChunks.toLocaleString()} /{' '}
          {progress.totalChunks.toLocaleString()} chunks)
        </p>
      </div>

      {/* Error message */}
      {isFailed && progress.error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          ❌ Error: {progress.error}
        </div>
      )}

      {/* Queue info */}
      {remainingDocuments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-1">
            Remaining: {remainingDocuments.slice(0, 3).join(', ')}
            {remainingDocuments.length > 3 && ` +${remainingDocuments.length - 3} more`}
          </p>
          {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
            <p className="text-xs text-gray-500">
              ⏱️ Estimated time: {formatTimeRemaining(estimatedTimeRemaining)}
            </p>
          )}
        </div>
      )}

      {/* Complete message */}
      {isComplete && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          ✅ Document vectorized successfully
        </div>
      )}
    </div>
  );
}
