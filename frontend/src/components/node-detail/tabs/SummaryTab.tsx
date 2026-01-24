'use client';

import { formatDateTime } from '@/lib/utils';
import { toDisplayString, extractDisplayValue } from '@/lib/node-utils';
import type { Node, NodeType, FieldKind } from '@/types/workflow';

interface SummaryTabProps {
  node: Node;
  nodeType: NodeType;
}

export function SummaryTab({ node, nodeType }: SummaryTabProps) {
  // Get summary if it exists (handle annotated values)
  const rawSummary = node.properties?.summary;
  const summary = rawSummary ? toDisplayString(rawSummary) : undefined;

  // Get key fields to display (first few non-system fields)
  const keyFields = nodeType.fields
    .filter((f) => !['summary', 'author'].includes(f.key))
    .slice(0, 6);

  return (
    <div className="p-4 space-y-6">
      {/* Summary section */}
      {summary && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Summary</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Key fields */}
      {keyFields.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Details</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {keyFields.map((field) => {
              const value = node.properties?.[field.key];
              if (value === undefined || value === null || value === '') {
                return null;
              }

              return (
                <div key={field.key}>
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="text-sm text-foreground mt-0.5">
                    <FieldValue value={value} kind={field.kind} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/* Timestamps */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Activity</h3>
        <dl className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-foreground">{formatDateTime(node.created_at)}</dd>
          </div>
          <div className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">Last updated</dt>
            <dd className="text-foreground">{formatDateTime(node.updated_at)}</dd>
          </div>
        </dl>
      </div>

      {/* Empty state */}
      {!summary && keyFields.every((f) => !node.properties?.[f.key]) && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No summary or details available for this node.
          </p>
        </div>
      )}
    </div>
  );
}

function FieldValue({ value, kind }: { value: unknown; kind: FieldKind }) {
  // Extract the display value (handle annotated values)
  const displayValue = extractDisplayValue(value);

  if (displayValue === null || displayValue === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (kind) {
    case 'datetime':
      return <>{formatDateTime(displayValue as string)}</>;

    case 'tag[]':
      if (Array.isArray(displayValue) && displayValue.length > 0) {
        return (
          <div className="flex flex-wrap gap-1">
            {displayValue.map((tag, i) => (
              <span
                key={i}
                className="inline-block px-2 py-0.5 text-xs rounded-full bg-muted text-foreground"
              >
                {toDisplayString(tag)}
              </span>
            ))}
          </div>
        );
      }
      return <span className="text-muted-foreground">-</span>;

    case 'json':
      if (typeof displayValue === 'object') {
        return (
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 text-foreground">
            {JSON.stringify(displayValue, null, 2)}
          </pre>
        );
      }
      return <>{String(displayValue)}</>;

    case 'enum':
      return (
        <span className="inline-block px-2 py-0.5 text-xs rounded bg-muted text-foreground">
          {toDisplayString(displayValue)}
        </span>
      );

    case 'number':
      return <>{typeof displayValue === 'number' ? displayValue.toLocaleString() : String(displayValue)}</>;

    default:
      return <>{toDisplayString(displayValue)}</>;
  }
}
