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
  onCreateNode?: (nodeType: string, parentNodeId: string) => void;
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
  onCreateNode,
}: RecordDetailProps) {
  // Determine which property fields to show
  const propertyFields = recordConfig?.propertyFields || nodeType.fields.map((f) => f.key);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{node.title}</h2>
            <p className="text-sm text-muted-foreground">{nodeType.displayName}</p>
          </div>
          {node.status && (
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
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
        <div className="rounded-lg border border-border bg-card p-8">
          <div className="flex items-center justify-center text-muted-foreground">
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
              onCreateNode={onCreateNode}
            />
          );
        })
      )}
    </div>
  );
}
