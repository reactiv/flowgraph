'use client';

import type {
  PendingResult,
  SeedNode,
  SeedEdge,
  MatchDecision,
  MatchConfidence,
  NodeMatchResult,
  EdgeMatchResult,
} from '@/types/endpoint';

interface DeltaPreviewProps {
  result: PendingResult;
}

const decisionConfig: Record<MatchDecision, { bg: string; text: string; label: string }> = {
  create: { bg: 'bg-green-100', text: 'text-green-700', label: 'CREATE' },
  update: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'UPDATE' },
  skip: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'SKIP' },
};

function MatchBadge({
  decision,
  confidence,
}: {
  decision: MatchDecision;
  confidence: MatchConfidence;
}) {
  const config = decisionConfig[decision];

  return (
    <div className="flex items-center gap-1.5">
      <span className={`${config.bg} ${config.text} text-xs px-2 py-0.5 rounded`}>
        {config.label}
      </span>
      {confidence !== 'none' && (
        <span className="text-xs text-muted-foreground">({confidence})</span>
      )}
    </div>
  );
}

export function DeltaPreview({ result }: DeltaPreviewProps) {
  const { httpMethod, matchResult } = result;

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

    // If we have match results, show the enriched view
    if (matchResult) {
      const { node_matches, edge_matches } = matchResult;

      // Group node matches by decision
      const toCreate = node_matches.filter((m) => m.decision === 'create');
      const toUpdate = node_matches.filter((m) => m.decision === 'update');
      const toSkip = node_matches.filter((m) => m.decision === 'skip');

      // Group edge matches by decision
      const edgesToCreate = edge_matches.filter((m) => m.decision === 'create');
      const edgesToSkip = edge_matches.filter((m) => m.decision === 'skip');

      return (
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex flex-wrap gap-3 text-sm">
            {toCreate.length > 0 && (
              <span className="bg-green-50 text-green-700 px-2 py-1 rounded">
                {toCreate.length} new
              </span>
            )}
            {toUpdate.length > 0 && (
              <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
                {toUpdate.length} to update
              </span>
            )}
            {toSkip.length > 0 && (
              <span className="bg-gray-50 text-gray-500 px-2 py-1 rounded">
                {toSkip.length} duplicates
              </span>
            )}
            {edgesToCreate.length > 0 && (
              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
                {edgesToCreate.length} edges
              </span>
            )}
            {edgesToSkip.length > 0 && (
              <span className="bg-gray-50 text-gray-500 px-2 py-1 rounded">
                {edgesToSkip.length} existing edges
              </span>
            )}
          </div>

          {/* Nodes to create */}
          {toCreate.length > 0 && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">
                  CREATE
                </span>
                New Nodes ({toCreate.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {toCreate.map((match, i) => {
                  const node = nodes.find((n) => n.temp_id === match.temp_id) || null;
                  return <NodeWithMatchCard key={i} node={node} match={match} />;
                })}
              </div>
            </div>
          )}

          {/* Nodes to update */}
          {toUpdate.length > 0 && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">
                  UPDATE
                </span>
                Existing Nodes ({toUpdate.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {toUpdate.map((match, i) => {
                  const node = nodes.find((n) => n.temp_id === match.temp_id) || null;
                  return <NodeWithMatchCard key={i} node={node} match={match} />;
                })}
              </div>
            </div>
          )}

          {/* Nodes to skip */}
          {toSkip.length > 0 && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded">
                  SKIP
                </span>
                Duplicates ({toSkip.length})
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {toSkip.map((match, i) => (
                  <div key={i} className="border rounded p-2 text-sm bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {match.incoming_node_type}
                        </span>
                        <span className="truncate">{match.incoming_title}</span>
                      </div>
                      <MatchBadge decision={match.decision} confidence={match.confidence} />
                    </div>
                    {match.match_reason && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        {match.match_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edges */}
          {(edgesToCreate.length > 0 || edgesToSkip.length > 0) && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">
                  CONNECT
                </span>
                Edges ({edgesToCreate.length} new, {edgesToSkip.length} existing)
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {edgesToCreate.map((match, i) => {
                  const edge = edges.find(
                    (e) =>
                      e.from_temp_id === match.from_temp_id &&
                      e.to_temp_id === match.to_temp_id &&
                      e.edge_type === match.edge_type
                  );
                  return edge ? <EdgeWithMatchCard key={i} edge={edge} match={match} /> : null;
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // No match results - show original view
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
            {updates.map((update, i) => {
              const props = update.properties || {};
              const propKeys = Object.keys(props);
              return (
                <div key={i} className="border rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-xs text-muted-foreground truncate max-w-[250px]" title={update.node_id}>
                      {update.node_id}
                    </div>
                    <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">
                      {propKeys.length} field{propKeys.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {propKeys.length > 0 && (
                    <div className="bg-yellow-50/50 border border-yellow-200/50 rounded p-2">
                      <div className="text-xs font-medium text-yellow-800 mb-1.5">Setting properties:</div>
                      <div className="space-y-1">
                        {Object.entries(props).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 text-xs">
                            <span className="font-mono font-medium text-yellow-700 min-w-0 flex-shrink-0">
                              {key}:
                            </span>
                            <span className="text-green-700 font-medium truncate max-w-[200px]" title={formatValue(value)}>
                              {formatValue(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
        {node.status && <span className="text-xs text-muted-foreground">({node.status})</span>}
      </div>
      {Object.keys(node.properties || {}).length > 0 && (
        <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-24">
          {JSON.stringify(node.properties, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Format a property value for display */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value.length > 50 ? value.slice(0, 50) + '...' : value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Component to show property changes with old → new values */
function PropertyDiff({
  propertiesToUpdate,
  matchedProperties,
  unchangedKeys,
}: {
  propertiesToUpdate: Record<string, unknown>;
  matchedProperties?: Record<string, unknown>;
  unchangedKeys?: string[];
}) {
  const changedKeys = Object.keys(propertiesToUpdate);

  if (changedKeys.length === 0 && (!unchangedKeys || unchangedKeys.length === 0)) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {/* Changed properties */}
      {changedKeys.map((key) => {
        const oldValue = matchedProperties?.[key];
        const newValue = propertiesToUpdate[key];
        return (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="font-mono font-medium text-yellow-700 min-w-0 flex-shrink-0">
              {key}:
            </span>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {oldValue !== undefined && (
                <>
                  <span className="text-red-600 line-through truncate max-w-[150px]" title={formatValue(oldValue)}>
                    {formatValue(oldValue)}
                  </span>
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <span className="text-green-700 font-medium truncate max-w-[200px]" title={formatValue(newValue)}>
                {formatValue(newValue)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Unchanged properties (collapsed) */}
      {unchangedKeys && unchangedKeys.length > 0 && (
        <div className="text-xs text-muted-foreground/70 pt-1 border-t border-muted mt-2">
          <span className="italic">Unchanged: </span>
          <span className="font-mono">{unchangedKeys.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

function NodeWithMatchCard({ node, match }: { node: SeedNode | null; match: NodeMatchResult }) {
  // Use match data as primary source (always populated), node data as secondary
  const nodeType = match.incoming_node_type || node?.node_type || 'Unknown';
  const title = match.incoming_title || node?.title || 'Untitled';
  const status = node?.status;
  const properties = node?.properties || {};

  return (
    <div className="border rounded p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{nodeType}</span>
          <span className="font-medium truncate">{title}</span>
          {status && <span className="text-xs text-muted-foreground">({status})</span>}
        </div>
        <MatchBadge decision={match.decision} confidence={match.confidence} />
      </div>

      {match.decision === 'update' && match.matched_node_title && (
        <div className="text-xs text-muted-foreground mb-2">
          Updating: &quot;{match.matched_node_title}&quot;
          {match.matched_node_id && (
            <span className="font-mono text-[10px] ml-1 opacity-60">({match.matched_node_id.slice(0, 8)}...)</span>
          )}
        </div>
      )}

      {match.match_reason && (
        <p className="text-xs text-muted-foreground italic mb-2">{match.match_reason}</p>
      )}

      {match.decision === 'update' &&
        match.properties_to_update &&
        Object.keys(match.properties_to_update).length > 0 && (
          <div className="bg-yellow-50/50 border border-yellow-200/50 rounded p-2">
            <div className="text-xs font-medium text-yellow-800 mb-1">Property changes:</div>
            <PropertyDiff
              propertiesToUpdate={match.properties_to_update}
              matchedProperties={match.matched_node_properties}
              unchangedKeys={match.properties_unchanged}
            />
          </div>
        )}

      {match.decision === 'create' && Object.keys(properties).length > 0 && (
        <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-24">
          {JSON.stringify(properties, null, 2)}
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
        <svg
          className="w-4 h-4 inline"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{edge.edge_type}</span>
      <span className="text-muted-foreground">
        <svg
          className="w-4 h-4 inline"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
      <span className="font-mono text-xs truncate">{edge.to_temp_id}</span>
    </div>
  );
}

function EdgeWithMatchCard({ edge, match }: { edge: SeedEdge; match: EdgeMatchResult }) {
  return (
    <div className="border rounded p-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs truncate">{edge.from_temp_id}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{edge.edge_type}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono text-xs truncate">{edge.to_temp_id}</span>
        </div>
        <MatchBadge decision={match.decision} confidence={match.confidence} />
      </div>
      {match.match_reason && (
        <p className="text-xs text-muted-foreground mt-1 italic">{match.match_reason}</p>
      )}
    </div>
  );
}
