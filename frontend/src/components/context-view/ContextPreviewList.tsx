'use client';

import { Star, CircleDot } from 'lucide-react';
import type { WorkflowDefinition } from '@/types/workflow';
import type { ContextPreview, ContextPreviewNode } from '@/types/context-selector';

interface ContextPreviewListProps {
  /** The context preview data. */
  preview: ContextPreview | undefined;

  /** Workflow definition for display names. */
  workflowDefinition: WorkflowDefinition;

  /** Whether to show the graph visualization (placeholder for now). */
  showGraph?: boolean;

  /** Layout mode. */
  mode?: 'compact' | 'expanded';
}

// Color palette for paths - using Tailwind colors that work in dark mode
const PATH_COLORS: Record<string, string> = {
  neighbors: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  similar: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

function getPathColor(pathName: string): string {
  if (PATH_COLORS[pathName]) return PATH_COLORS[pathName];

  // Generate consistent color based on path name hash
  const colors = [
    'bg-green-500/20 text-green-400 border-green-500/30',
    'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  ];

  let hash = 0;
  for (let i = 0; i < pathName.length; i++) {
    hash = (hash << 5) - hash + pathName.charCodeAt(i);
    hash |= 0;
  }
  const colorIndex = Math.abs(hash) % colors.length;
  // Safe access - colors array is always populated
  return colors[colorIndex] as string;
}

function getNodeTypeDisplayName(
  type: string,
  workflowDefinition: WorkflowDefinition
): string {
  const nodeType = workflowDefinition.nodeTypes.find((nt) => nt.type === type);
  return nodeType?.displayName || type;
}

function NodeCard({
  node,
  workflowDefinition,
  isSource = false,
}: {
  node: ContextPreviewNode;
  workflowDefinition: WorkflowDefinition;
  isSource?: boolean;
}) {
  const displayName = getNodeTypeDisplayName(node.type, workflowDefinition);
  const pathColor = node.pathName ? getPathColor(node.pathName) : '';

  return (
    <div
      className={`border rounded-lg p-3 ${
        isSource ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isSource ? (
            <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <CircleDot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{node.title}</p>
            <p className="text-xs text-muted-foreground">{displayName}</p>
          </div>
        </div>

        {node.pathName && !isSource && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${pathColor}`}
          >
            {node.pathName}
          </span>
        )}
      </div>

      {node.status && (
        <div className="mt-2">
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {node.status}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * List view of context nodes grouped by path.
 */
export function ContextPreviewList({
  preview,
  workflowDefinition,
  showGraph = true,
}: ContextPreviewListProps) {
  if (!preview || !preview.sourceNode) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No preview data available
      </div>
    );
  }

  const { sourceNode, pathResults = {} } = preview;
  const pathNames = Object.keys(pathResults);

  return (
    <div className="p-4 space-y-4">
      {/* Graph placeholder */}
      {showGraph && (
        <div className="border border-border rounded-lg bg-muted/50 p-4 text-center text-muted-foreground text-sm">
          Graph visualization will appear here
        </div>
      )}

      {/* Source node */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
          Source Node
        </h4>
        <NodeCard
          node={sourceNode}
          workflowDefinition={workflowDefinition}
          isSource
        />
      </div>

      {/* Path results */}
      {pathNames.map((pathName) => {
        const nodes = pathResults[pathName];
        if (!nodes || nodes.length === 0) return null;

        const pathColor = getPathColor(pathName);

        return (
          <div key={pathName}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full border text-xs font-medium ${pathColor}`}
              >
                {pathName}
              </span>
              <span className="text-muted-foreground/70">({nodes.length})</span>
            </h4>
            <div className="space-y-2">
              {nodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  workflowDefinition={workflowDefinition}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {pathNames.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-4">
          No context nodes selected. Configure paths in the Form tab.
        </div>
      )}
    </div>
  );
}
