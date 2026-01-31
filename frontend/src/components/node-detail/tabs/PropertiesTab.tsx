'use client';

import { useState, useEffect } from 'react';
import type { Node, NodeType, Field, WorkflowDefinition } from '@/types/workflow';
import { FieldInput } from '@/components/shared/FieldInput';
import { SuggestFieldValueModal } from '../SuggestFieldValueModal';

interface PropertiesTabProps {
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  node: Node;
  nodeType: NodeType;
  onSave: (properties: Record<string, unknown>) => void;
  isSaving: boolean;
}

export function PropertiesTab({ workflowId, workflowDefinition, node, nodeType, onSave, isSaving }: PropertiesTabProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [suggestModal, setSuggestModal] = useState<{
    isOpen: boolean;
    field: Field | null;
  }>({ isOpen: false, field: null });

  // Initialize form data from node properties
  useEffect(() => {
    setFormData({ ...node.properties });
    setIsDirty(false);
  }, [node.properties]);

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(formData);
    setIsDirty(false);
  };

  const handleReset = () => {
    setFormData({ ...node.properties });
    setIsDirty(false);
  };

  const handleSuggestClick = (field: Field) => {
    setSuggestModal({ isOpen: true, field });
  };

  const handleSuggestClose = () => {
    setSuggestModal({ isOpen: false, field: null });
  };

  const handleSuggestAccept = (value: unknown) => {
    if (suggestModal.field) {
      handleFieldChange(suggestModal.field.key, value);
    }
    handleSuggestClose();
  };

  return (
    <div className="p-4">
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        <div className="space-y-4">
          {nodeType.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              disabled={isSaving}
              onSuggestClick={() => handleSuggestClick(field)}
            />
          ))}
        </div>

        {/* Save/Reset buttons */}
        {isDirty && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-md disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>

      {/* Suggest Field Value Modal */}
      {suggestModal.field && (
        <SuggestFieldValueModal
          workflowId={workflowId}
          workflowDefinition={workflowDefinition}
          node={node}
          field={suggestModal.field}
          currentValue={formData[suggestModal.field.key]}
          isOpen={suggestModal.isOpen}
          onClose={handleSuggestClose}
          onAccept={handleSuggestAccept}
        />
      )}
    </div>
  );
}

