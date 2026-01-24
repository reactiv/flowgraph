'use client';

import type { Node } from '@/types/workflow';
import type { CardTemplate } from '@/types/view-templates';
import { toDisplayString } from '@/lib/node-utils';
import { getStatusColor } from '@/lib/theme';

interface NodeCardProps {
  node: Node;
  cardTemplate?: CardTemplate;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export function NodeCard({ node, cardTemplate, onClick, draggable, onDragStart }: NodeCardProps) {
  // Get title from cardTemplate or fall back to node.title
  const title = cardTemplate?.titleField
    ? toDisplayString(node.properties[cardTemplate.titleField]) || node.title
    : node.title;

  // Get subtitle from cardTemplate
  const subtitle = cardTemplate?.subtitleField
    ? toDisplayString(node.properties[cardTemplate.subtitleField]) || null
    : null;

  // Get status
  const status = cardTemplate?.statusField
    ? toDisplayString(node.properties[cardTemplate.statusField]) || node.status
    : node.status;

  // Get body fields
  const bodyFields = cardTemplate?.bodyFields || [];

  // Get status color - prefer config colors, fall back to centralized theme
  const configColor = status && cardTemplate?.statusColors?.[status];
  const statusColorClass = configColor
    ? ''
    : status
      ? getStatusColor(status)
      : '';

  // Convert hex to rgba for background (with alpha for lighter background)
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const statusStyle = configColor
    ? {
        backgroundColor: hexToRgba(configColor, 0.15),
        color: configColor,
        borderColor: hexToRgba(configColor, 0.3),
      }
    : undefined;

  return (
    <div
      className={`rounded-lg border border-border bg-card p-3 transition-all duration-200 hover:border-primary/50 ${
        onClick ? 'cursor-pointer' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-medium text-foreground">{title}</h4>
          {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {status && (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColorClass}`}
            style={statusStyle}
          >
            {status}
          </span>
        )}
      </div>

      {bodyFields.length > 0 && (
        <div className="mt-2 space-y-1">
          {bodyFields.map((field) => {
            const value = node.properties[field];
            if (value === undefined || value === null) return null;
            return (
              <p key={field} className="truncate text-sm text-muted-foreground">
                <span className="font-medium capitalize text-foreground/70">{field.replace(/_/g, ' ')}:</span>{' '}
                {toDisplayString(value)}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
