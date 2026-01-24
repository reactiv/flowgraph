'use client';

import { useState, useMemo } from 'react';
import type { Node } from '@/types/workflow';
import type { RecordSelectorStyle } from '@/types/view-templates';

interface RecordSelectorProps {
  nodes: Node[];
  selectedNodeId: string | null;
  onSelectNode: (node: Node) => void;
  selectorStyle: RecordSelectorStyle;
  nodeTypeName: string;
}

export function RecordSelector({
  nodes,
  selectedNodeId,
  onSelectNode,
  selectorStyle,
  nodeTypeName,
}: RecordSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter nodes by search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const query = searchQuery.toLowerCase();
    return nodes.filter(
      (node) =>
        node.title.toLowerCase().includes(query) ||
        node.status?.toLowerCase().includes(query)
    );
  }, [nodes, searchQuery]);

  if (selectorStyle === 'dropdown') {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <label className="mb-2 block text-sm font-medium text-foreground">
          Select {nodeTypeName}
        </label>
        <select
          className="w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          value={selectedNodeId || ''}
          onChange={(e) => {
            const node = nodes.find((n) => n.id === e.target.value);
            if (node) onSelectNode(node);
          }}
        >
          <option value="">Select...</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
              {node.status ? ` (${node.status})` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (selectorStyle === 'cards') {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-3">
          <h3 className="mb-2 font-medium text-foreground">{nodeTypeName}</h3>
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-md border border-border bg-input text-foreground px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto p-2">
          <div className="grid grid-cols-1 gap-2">
            {filteredNodes.map((node) => (
              <button
                key={node.id}
                onClick={() => onSelectNode(node)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedNodeId === node.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="font-medium text-foreground truncate">{node.title}</div>
                {node.status && (
                  <div className="mt-1 text-xs text-muted-foreground">{node.status}</div>
                )}
              </button>
            ))}
            {filteredNodes.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {searchQuery ? 'No matches found' : 'No items'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: list style
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-3">
        <h3 className="mb-2 font-medium text-foreground">{nodeTypeName}</h3>
        <input
          type="text"
          placeholder="Search..."
          className="w-full rounded-md border border-border bg-input text-foreground px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        <ul className="divide-y divide-border">
          {filteredNodes.map((node) => (
            <li key={node.id}>
              <button
                onClick={() => onSelectNode(node)}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  selectedNodeId === node.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    selectedNodeId === node.id ? 'bg-primary' : 'bg-muted-foreground/50'
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{node.title}</span>
                {node.status && (
                  <span className="shrink-0 text-xs text-muted-foreground">{node.status}</span>
                )}
              </button>
            </li>
          ))}
          {filteredNodes.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">
              {searchQuery ? 'No matches found' : 'No items'}
            </li>
          )}
        </ul>
      </div>
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {nodes.length} {nodes.length === 1 ? 'item' : 'items'}
      </div>
    </div>
  );
}
