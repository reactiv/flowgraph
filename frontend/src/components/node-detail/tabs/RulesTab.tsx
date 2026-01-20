'use client';

import { ShieldCheck, ShieldAlert, Link as LinkIcon } from 'lucide-react';
import type { Rule, Node, NeighborsResponse } from '@/types/workflow';

interface RulesTabProps {
  node: Node;
  rules: Rule[];
  neighbors: NeighborsResponse | undefined;
}

/**
 * Counts edges by type from neighbors data.
 */
function countEdgesByType(neighbors: NeighborsResponse | undefined): Record<string, number> {
  const counts: Record<string, number> = {};

  if (!neighbors) return counts;

  for (const item of neighbors.outgoing || []) {
    const edgeType = item.edge.type;
    counts[edgeType] = (counts[edgeType] || 0) + 1;
  }

  for (const item of neighbors.incoming || []) {
    const edgeType = item.edge.type;
    counts[edgeType] = (counts[edgeType] || 0) + 1;
  }

  return counts;
}

/**
 * Tab component showing applicable workflow rules for the current node.
 *
 * Displays each rule with its satisfaction status:
 * - Green check: Rule is satisfied (has required edges)
 * - Yellow warning: Rule is not satisfied (would block transition)
 */
export function RulesTab({ node, rules, neighbors }: RulesTabProps) {
  // Filter to rules that apply to this node type
  const applicableRules = rules.filter((rule) => rule.when.nodeType === node.type);

  // Count edges by type
  const edgeCounts = countEdgesByType(neighbors);

  if (applicableRules.length === 0) {
    return (
      <div className="p-6 text-center">
        <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-green-500" />
        <p className="text-muted-foreground">No compliance rules apply to this node type.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Status changes are not restricted by rules.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground mb-2">
        {applicableRules.length} rule{applicableRules.length !== 1 ? 's' : ''} apply to{' '}
        <span className="font-medium text-foreground">{node.type}</span> nodes
      </div>

      {applicableRules.map((rule) => {
        // Check if rule is satisfied
        const isSatisfied = rule.requireEdges.every((req) => {
          const count = edgeCounts[req.edgeType] || 0;
          return count >= req.minCount;
        });

        return (
          <div
            key={rule.id}
            className={`border rounded-lg p-4 transition-colors ${
              isSatisfied
                ? 'border-green-200 bg-green-50/50'
                : 'border-yellow-200 bg-yellow-50/50'
            }`}
          >
            <div className="flex items-start gap-3">
              {isSatisfied ? (
                <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{rule.message}</p>

                {rule.when.transitionTo && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Applies when transitioning to:{' '}
                    <span className="font-medium">{rule.when.transitionTo}</span>
                  </p>
                )}

                {/* Edge requirements */}
                <div className="mt-3 space-y-1.5">
                  {rule.requireEdges.map((req) => {
                    const count = edgeCounts[req.edgeType] || 0;
                    const met = count >= req.minCount;

                    return (
                      <div
                        key={req.edgeType}
                        className={`text-xs flex items-center gap-2 ${
                          met ? 'text-green-700' : 'text-yellow-700'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          met ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
                        }`}>
                          {met ? '✓' : '!'}
                        </span>
                        <LinkIcon className="h-3 w-3" />
                        <span className="font-medium">{req.edgeType}</span>
                        <span className="text-muted-foreground">
                          {count} / {req.minCount} required
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
