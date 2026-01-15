'use client';

import type { ViewTemplate } from '@/types/view-templates';
import { ViewCard, CreateViewCard } from './ViewCard';

interface ViewCardGridProps {
  viewTemplates: ViewTemplate[];
  selectedViewId: string | null;
  onViewSelect: (viewId: string | null) => void;
  onCreateClick: () => void;
  onEditView?: (view: ViewTemplate) => void;
  onDeleteView?: (viewId: string) => void;
}

export function ViewCardGrid({
  viewTemplates,
  selectedViewId,
  onViewSelect,
  onCreateClick,
  onEditView,
  onDeleteView,
}: ViewCardGridProps) {
  // List View is always first (built-in)
  const listView = {
    id: 'list' as const,
    name: 'List View',
    description: 'View all items in a table',
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
        {/* List View card (always first, built-in) */}
        <ViewCard
          view={listView}
          isSelected={selectedViewId === null}
          isBuiltIn={true}
          onSelect={() => onViewSelect(null)}
        />

        {/* Template view cards */}
        {viewTemplates.map((view) => (
          <ViewCard
            key={view.id}
            view={view}
            isSelected={selectedViewId === view.id}
            onSelect={() => onViewSelect(view.id)}
            onEdit={onEditView ? () => onEditView(view) : undefined}
            onDelete={onDeleteView ? () => onDeleteView(view.id) : undefined}
          />
        ))}

        {/* Create new view card */}
        <CreateViewCard onClick={onCreateClick} />
      </div>
    </div>
  );
}
