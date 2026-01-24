'use client';

import type { LayoutType } from './utils/layoutUtils';

interface GraphControlsProps {
  layout: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
  nodeCount: number;
  edgeCount: number;
}

/**
 * Control bar for the graph view with layout toggle and stats.
 */
export function GraphControls({
  layout,
  onLayoutChange,
  nodeCount,
  edgeCount,
}: GraphControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-4 bg-card/95 backdrop-blur-sm rounded-lg shadow-md px-4 py-2 border border-border">
      {/* Layout Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Layout:</span>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => onLayoutChange('force')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              layout === 'force'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
            title="Cluster by node type"
          >
            Cluster
          </button>
          <button
            onClick={() => onLayoutChange('dagre')}
            className={`px-3 py-1 text-xs font-medium border-l border-border transition-colors ${
              layout === 'dagre'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
            title="Hierarchical top-to-bottom layout"
          >
            Hierarchy
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-border" />

      {/* Stats */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{nodeCount} nodes</span>
        <span>{edgeCount} edges</span>
      </div>
    </div>
  );
}
