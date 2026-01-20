'use client';

import type { Node, NodeType, WorkflowDefinition } from '@/types/workflow';
import type {
  ViewTemplate,
  RecordConfig,
  LevelData,
} from '@/types/view-templates';
import { RecordPropertiesSection } from './RecordPropertiesSection';
import { RecordRelatedSection } from './RecordRelatedSection';

interface RecordDetailProps {
  node: Node;
  nodeType: NodeType;
  levelData: Record<string, LevelData>;
  viewTemplate: ViewTemplate;
  workflowDefinition: WorkflowDefinition;
  recordConfig: RecordConfig;
  isLoading: boolean;
  onNodeClick?: (node: Node) => void;
}

export function RecordDetail({
  node,
  nodeType,
  levelData,
  viewTemplate,
  workflowDefinition,
  recordConfig,
  isLoading,
  onNodeClick,
}: RecordDetailProps) {
  // Determine which property fields to show
  const propertyFields = recordConfig?.propertyFields || nodeType.fields.map((f) => f.key);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{node.title}</h2>
            <p className="text-sm text-gray-500">{nodeType.displayName}</p>
          </div>
          {node.status && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
              {node.status}
            </span>
          )}
        </div>
      </div>

      {/* Properties Section */}
      {recordConfig?.showProperties !== false && (
        <RecordPropertiesSection
          node={node}
          nodeType={nodeType}
          propertyFields={propertyFields}
          title={recordConfig?.propertiesTitle || 'Properties'}
        />
      )}

      {/* Related Sections */}
      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8">
          <div className="flex items-center justify-center text-gray-500">
            Loading related items...
          </div>
        </div>
      ) : (
        recordConfig?.sections?.map((sectionConfig) => {
          const levelConfig = viewTemplate.levels[sectionConfig.targetType];
          const sectionLevelData = levelData[sectionConfig.targetType];

          // Get the target node type definition
          const targetNodeType = workflowDefinition.nodeTypes.find(
            (nt) => nt.type === sectionConfig.targetType
          );

          return (
            <RecordRelatedSection
              key={sectionConfig.targetType}
              title={sectionConfig.title || targetNodeType?.displayName || sectionConfig.targetType}
              description={sectionConfig.description}
              levelData={sectionLevelData}
              levelConfig={levelConfig}
              targetNodeType={targetNodeType}
              parentNode={node}
              displayNested={sectionConfig.displayNested}
              collapsedByDefault={sectionConfig.collapsedByDefault}
              maxItems={sectionConfig.maxItems}
              emptyMessage={sectionConfig.emptyMessage}
              allowCreate={sectionConfig.allowCreate}
              onNodeClick={onNodeClick}
            />
          );
        })
      )}
    </div>
  );
}
