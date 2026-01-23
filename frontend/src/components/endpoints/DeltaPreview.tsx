'use client';

import type { PendingResult, SeedNode, SeedEdge } from '@/types/endpoint';

interface DeltaPreviewProps {
  result: PendingResult;
}

export function DeltaPreview({ result }: DeltaPreviewProps) {
  const { httpMethod } = result;

  if (httpMethod === 'GET') {
    return (
      <div className="text-sm text-muted-foreground">
        GET endpoints return query results. No changes to preview.
      </div>
    );
  }

  if (httpMethod === 'POST') {
    const nodes = result.nodesToCreate || [];
    const edges = result.edgesToCreate || [];

    return (
      <div className="space-y-6">
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">CREATE</span>
            Nodes ({nodes.length})
          </h4>
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nodes to create</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {nodes.map((node: SeedNode, i: number) => (
                <NodePreviewCard key={i} node={node} />
              ))}
            </div>
          )}
        </div>

        {edges.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">CONNECT</span>
              Edges ({edges.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {edges.map((edge: SeedEdge, i: number) => (
                <EdgePreviewCard key={i} edge={edge} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (httpMethod === 'PUT') {
    const updates = result.updatesToApply || [];

    return (
      <div>
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">UPDATE</span>
          Nodes ({updates.length})
        </h4>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No nodes to update</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {updates.map((update, i) => (
              <div key={i} className="border rounded p-3 text-sm">
                <div className="font-mono text-xs text-muted-foreground mb-2">
                  {update.node_id}
                </div>
                <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(update.properties, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (httpMethod === 'DELETE') {
    const nodeIds = result.nodesToDelete || [];

    return (
      <div>
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">DELETE</span>
          Nodes ({nodeIds.length})
        </h4>
        {nodeIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No nodes to delete</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {nodeIds.map((nodeId, i) => (
              <div key={i} className="font-mono text-sm p-2 bg-red-50 border border-red-200 rounded">
                {nodeId}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function NodePreviewCard({ node }: { node: SeedNode }) {
  return (
    <div className="border rounded p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{node.node_type}</span>
        <span className="font-medium truncate">{node.title}</span>
        {node.status && (
          <span className="text-xs text-muted-foreground">({node.status})</span>
        )}
      </div>
      {Object.keys(node.properties || {}).length > 0 && (
        <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-24">
          {JSON.stringify(node.properties, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EdgePreviewCard({ edge }: { edge: SeedEdge }) {
  return (
    <div className="border rounded p-2 text-sm flex items-center gap-2">
      <span className="font-mono text-xs truncate">{edge.from_temp_id}</span>
      <span className="text-muted-foreground">
        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{edge.edge_type}</span>
      <span className="text-muted-foreground">
        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
      <span className="font-mono text-xs truncate">{edge.to_temp_id}</span>
    </div>
  );
}
