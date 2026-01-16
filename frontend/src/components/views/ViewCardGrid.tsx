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
  // Built-in views
  const listView = {
    id: 'list' as const,
    name: 'List View',
    description: 'View all items in a table',
  };

  const schemaView = {
    id: 'schema' as const,
    name: 'Schema Graph',
    description: 'Visualize node types and relationships',
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
        {/* Schema Graph card (built-in) */}
        <ViewCard
          view={schemaView}
          isSelected={selectedViewId === 'schema'}
          isBuiltIn={true}
          onSelect={() => onViewSelect('schema')}
        />

        {/* List View card (built-in) */}
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
