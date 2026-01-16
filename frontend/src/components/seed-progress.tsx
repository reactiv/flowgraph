'use client';

/**
 * Progress bar component for displaying seeding progress.
 */
export interface SeedProgressData {
  phase: 'scenarios' | 'expanding' | 'summaries' | 'saving' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

interface SeedProgressProps {
  progress: SeedProgressData;
}

// Phase labels for human-readable display
const PHASE_LABELS: Record<SeedProgressData['phase'], string> = {
  scenarios: 'Generating scenarios',
  expanding: 'Expanding data',
  summaries: 'Creating summaries',
  saving: 'Saving to database',
  complete: 'Complete',
  error: 'Error',
};

export function SeedProgress({ progress }: SeedProgressProps) {
  const { phase, current, total, message } = progress;

  // Calculate percentage based on weighted phases
  // Scenarios: 60%, Expanding: 5%, Summaries: 30%, Saving: 5%
  const getOverallProgress = () => {
    if (phase === 'complete') return 100;
    if (phase === 'error') return 0;

    const phaseProgress = total > 0 ? current / total : 0;

    switch (phase) {
      case 'scenarios':
        return Math.round(phaseProgress * 60);
      case 'expanding':
        return 60 + Math.round(phaseProgress * 5);
      case 'summaries':
        return 65 + Math.round(phaseProgress * 30);
      case 'saving':
        return 95 + Math.round(phaseProgress * 5);
      default:
        return 0;
    }
  };

  const percent = getOverallProgress();

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Progress info */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{message}</span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2">
        {(['scenarios', 'expanding', 'summaries', 'saving'] as const).map((p, idx) => {
          const isActive = phase === p;
          const isComplete =
            (phase === 'complete') ||
            (phase === 'expanding' && idx === 0) ||
            (phase === 'summaries' && idx <= 1) ||
            (phase === 'saving' && idx <= 2);

          return (
            <div
              key={p}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : isComplete
                  ? 'bg-muted text-muted-foreground'
                  : 'text-muted-foreground/50'
              }`}
            >
              {isComplete && !isActive && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {isActive && (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              <span>{PHASE_LABELS[p]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
