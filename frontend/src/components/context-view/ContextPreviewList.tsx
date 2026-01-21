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

// Color palette for paths
const PATH_COLORS: Record<string, string> = {
  neighbors: 'bg-blue-100 text-blue-800 border-blue-200',
  similar: 'bg-purple-100 text-purple-800 border-purple-200',
};

function getPathColor(pathName: string): string {
  if (PATH_COLORS[pathName]) return PATH_COLORS[pathName];

  // Generate consistent color based on path name hash
  const colors = [
    'bg-green-100 text-green-800 border-green-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-cyan-100 text-cyan-800 border-cyan-200',
    'bg-yellow-100 text-yellow-800 border-yellow-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
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
        isSource ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isSource ? (
            <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <CircleDot className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{node.title}</p>
            <p className="text-xs text-gray-500">{displayName}</p>
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
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
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
      <div className="p-4 text-center text-gray-500 text-sm">
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
        <div className="border rounded-lg bg-gray-50 p-4 text-center text-gray-400 text-sm">
          Graph visualization will appear here
        </div>
      )}

      {/* Source node */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
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
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full border text-xs font-medium ${pathColor}`}
              >
                {pathName}
              </span>
              <span className="text-gray-400">({nodes.length})</span>
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
        <div className="text-center text-gray-500 text-sm py-4">
          No context nodes selected. Configure paths in the Form tab.
        </div>
      )}
    </div>
  );
}
