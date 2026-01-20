'use client';

import { useMemo } from 'react';
import type { WorkflowDefinition } from '@/types/workflow';
import type {
  ViewTemplateCreate,
  ViewStyle,
  KanbanConfig,
  CardsConfig,
  TreeConfig,
  TimelineConfig,
  TableConfig,
  GanttConfig,
  RecordConfig,
  StyleConfig,
} from '@/types/view-templates';

import { KanbanEditor } from './style-editors/KanbanEditor';
import { TableEditor } from './style-editors/TableEditor';
import { CardsEditor } from './style-editors/CardsEditor';
import { TimelineEditor } from './style-editors/TimelineEditor';
import { TreeEditor } from './style-editors/TreeEditor';
import { GanttEditor } from './style-editors/GanttEditor';
import { RecordEditor } from './style-editors/RecordEditor';

interface ViewEditorProps {
  view: ViewTemplateCreate;
  workflowDefinition: WorkflowDefinition;
  onChange: (view: ViewTemplateCreate) => void;
  mode: 'create' | 'edit';
  disabled?: boolean;
}

/** Get the style of the root level */
function getRootStyle(view: ViewTemplateCreate): ViewStyle | null {
  const rootLevel = view.levels[view.rootType];
  return rootLevel?.style || null;
}

/** Get friendly name for a style */
function getStyleLabel(style: ViewStyle): string {
  switch (style) {
    case 'kanban':
      return 'Kanban Board';
    case 'cards':
      return 'Cards';
    case 'tree':
      return 'Tree';
    case 'timeline':
      return 'Timeline';
    case 'table':
      return 'Table';
    case 'gantt':
      return 'Gantt Chart';
    case 'record':
      return 'Record View';
    default:
      return style;
  }
}

export function ViewEditor({
  view,
  workflowDefinition,
  onChange,
  mode: _mode,
  disabled = false,
}: ViewEditorProps) {
  // Get the root node type
  const rootNodeType = useMemo(
    () => workflowDefinition.nodeTypes.find((nt) => nt.type === view.rootType),
    [workflowDefinition, view.rootType]
  );

  // Get root level config
  const rootLevelConfig = view.levels[view.rootType];
  const rootStyle = getRootStyle(view);

  // Update basic info (name, description)
  const updateBasicInfo = (updates: Partial<Pick<ViewTemplateCreate, 'name' | 'description'>>) => {
    onChange({
      ...view,
      ...updates,
    });
  };

  // Update the root level's style config
  const updateStyleConfig = (styleConfig: StyleConfig) => {
    if (!rootLevelConfig) return;
    onChange({
      ...view,
      levels: {
        ...view.levels,
        [view.rootType]: {
          style: rootLevelConfig.style,
          styleConfig,
          inlineChildren: rootLevelConfig.inlineChildren,
          expandedByDefault: rootLevelConfig.expandedByDefault,
          actions: rootLevelConfig.actions,
        },
      },
    });
  };

  // Render the appropriate style editor
  const renderStyleEditor = () => {
    if (!rootNodeType || !rootLevelConfig) {
      return (
        <div className="text-sm text-gray-500 italic">
          Unable to find configuration for root type: {view.rootType}
        </div>
      );
    }

    switch (rootStyle) {
      case 'kanban':
        return (
          <KanbanEditor
            nodeType={rootNodeType}
            config={rootLevelConfig.styleConfig as KanbanConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      case 'table':
        return (
          <TableEditor
            nodeType={rootNodeType}
            config={rootLevelConfig.styleConfig as TableConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      case 'cards':
        return (
          <CardsEditor
            nodeType={rootNodeType}
            config={rootLevelConfig.styleConfig as CardsConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      case 'timeline':
        return (
          <TimelineEditor
            nodeType={rootNodeType}
            config={rootLevelConfig.styleConfig as TimelineConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      case 'tree':
        return (
          <TreeEditor
            nodeType={rootNodeType}
            config={rootLevelConfig.styleConfig as TreeConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      case 'gantt':
        return (
          <GanttEditor
            nodeType={rootNodeType}
            config={rootLevelConfig.styleConfig as GanttConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      case 'record':
        return (
          <RecordEditor
            nodeType={rootNodeType}
            workflowDefinition={workflowDefinition}
            config={rootLevelConfig.styleConfig as RecordConfig}
            onChange={updateStyleConfig}
            disabled={disabled}
          />
        );
      default:
        return (
          <div className="text-sm text-gray-500 italic">
            Unknown view style: {rootStyle}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Info Section */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="view-name" className="block text-sm font-medium text-gray-700">
            View Name <span className="text-red-500">*</span>
          </label>
          <input
            id="view-name"
            type="text"
            value={view.name}
            onChange={(e) => updateBasicInfo({ name: e.target.value })}
            disabled={disabled}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            placeholder="Enter view name"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="view-description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <input
            id="view-description"
            type="text"
            value={view.description || ''}
            onChange={(e) => updateBasicInfo({ description: e.target.value || undefined })}
            disabled={disabled}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            placeholder="Optional description"
          />
        </div>

        {/* Read-only info */}
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-500">Root Type:</span>{' '}
            <span className="font-medium text-gray-900">
              {rootNodeType?.displayName || view.rootType}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Style:</span>{' '}
            <span className="font-medium text-gray-900">
              {rootStyle ? getStyleLabel(rootStyle) : 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Style Configuration Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {rootStyle ? getStyleLabel(rootStyle) : 'View'} Configuration
        </h3>
        {renderStyleEditor()}
      </div>
    </div>
  );
}
