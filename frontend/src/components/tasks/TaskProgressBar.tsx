'use client';

import { useMemo } from 'react';
import type { TaskSetInstance, TaskSetProgress } from '@/types/task';
import { calculateProgress } from '@/types/task';
import { cn } from '@/lib/utils';

interface TaskProgressBarProps {
  instance: TaskSetInstance;
  showLabels?: boolean;
  className?: string;
}

export function TaskProgressBar({ instance, showLabels = true, className }: TaskProgressBarProps) {
  const progress = useMemo(() => calculateProgress(instance), [instance]);

  return (
    <div className={cn('space-y-1', className)}>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {progress.completed} of {progress.total} tasks
          </span>
          <span>{progress.percentComplete}%</span>
        </div>
      )}
      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
        {/* Completed (green) */}
        {progress.completed > 0 && (
          <div
            className="bg-green-500 dark:bg-green-600 transition-all duration-300"
            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
          />
        )}
        {/* In Progress (blue) */}
        {progress.inProgress > 0 && (
          <div
            className="bg-blue-500 dark:bg-blue-600 transition-all duration-300"
            style={{ width: `${(progress.inProgress / progress.total) * 100}%` }}
          />
        )}
        {/* Available (yellow) */}
        {progress.available > 0 && (
          <div
            className="bg-yellow-500 dark:bg-yellow-600 transition-all duration-300"
            style={{ width: `${(progress.available / progress.total) * 100}%` }}
          />
        )}
        {/* Blocked (red) */}
        {progress.blocked > 0 && (
          <div
            className="bg-red-500 dark:bg-red-600 transition-all duration-300"
            style={{ width: `${(progress.blocked / progress.total) * 100}%` }}
          />
        )}
        {/* Skipped (gray striped) */}
        {progress.skipped > 0 && (
          <div
            className="bg-gray-400 dark:bg-gray-500 transition-all duration-300"
            style={{ width: `${(progress.skipped / progress.total) * 100}%` }}
          />
        )}
      </div>
      {showLabels && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {progress.inProgress > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              {progress.inProgress} in progress
            </span>
          )}
          {progress.available > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-yellow-500 rounded-full" />
              {progress.available} available
            </span>
          )}
          {progress.blocked > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              {progress.blocked} blocked
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskProgressSummaryProps {
  progress: TaskSetProgress;
  className?: string;
}

export function TaskProgressSummary({ progress, className }: TaskProgressSummaryProps) {
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="font-medium">{progress.percentComplete}%</span>
      <span className="text-muted-foreground">
        ({progress.completed}/{progress.total})
      </span>
    </div>
  );
}
