'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface LearnedAssetsViewerProps {
  skillMd?: string | null;
  transformerCode?: string | null;
  mode: 'direct' | 'code';
  learnedAt?: string | null;
}

type Tab = 'skill' | 'code';

export function LearnedAssetsViewer({
  skillMd,
  transformerCode,
  mode,
  learnedAt,
}: LearnedAssetsViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('skill');

  const hasSkill = skillMd && skillMd.length > 0;
  const hasCode = mode === 'code' && transformerCode && transformerCode.length > 0;
  const hasAnyAsset = hasSkill || hasCode;

  if (!hasAnyAsset) {
    return null;
  }

  return (
    <div className="border-t bg-muted/20">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium">Learned Assets</span>
          <span className="text-xs text-muted-foreground">
            {learnedAt && `Learned ${new Date(learnedAt).toLocaleDateString()}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasSkill && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              SKILL.md
            </span>
          )}
          {hasCode && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              transform.py
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t">
          {/* Tabs if both assets exist */}
          {hasSkill && hasCode && (
            <div className="border-b bg-white px-4 flex gap-1">
              <button
                onClick={() => setActiveTab('skill')}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === 'skill'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                SKILL.md
              </button>
              <button
                onClick={() => setActiveTab('code')}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === 'code'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                transform.py
              </button>
            </div>
          )}

          {/* Content */}
          <div className="max-h-96 overflow-auto">
            {(activeTab === 'skill' || !hasCode) && hasSkill && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-mono">SKILL.md</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(skillMd || '')}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
                <pre className="font-mono text-xs whitespace-pre-wrap bg-white border rounded-md p-3 overflow-auto">
                  {skillMd}
                </pre>
              </div>
            )}

            {activeTab === 'code' && hasCode && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-mono">transform.py</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(transformerCode || '')}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
                <pre className="font-mono text-xs whitespace-pre-wrap bg-slate-900 text-slate-100 rounded-md p-3 overflow-auto">
                  {transformerCode}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
