'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NodeType, Field } from '@/types/workflow';
import type { CreateNodeDelta } from '@/types/task';
import { FieldInput } from '@/components/shared/FieldInput';

/** Single node type form props */
interface SingleFormProps {
  nodeType: NodeType;
  delta: CreateNodeDelta;
  onValuesChange: (values: Record<string, unknown>, isValid: boolean) => void;
  disabled?: boolean;
}

/** Compound form step configuration */
export interface CompoundFormStep {
  key: string;
  label?: string;
  nodeType: NodeType;
  delta: CreateNodeDelta;
}

/** Compound form props (multiple create_node steps) */
interface CompoundFormProps {
  steps: CompoundFormStep[];
  onValuesChange: (values: Record<string, unknown>, isValid: boolean) => void;
  disabled?: boolean;
}

/** Combined props - supports both single and compound forms */
interface TaskFieldFormProps {
  nodeType?: NodeType;
  delta?: CreateNodeDelta;
  compoundSteps?: CompoundFormStep[];
  onValuesChange: (values: Record<string, unknown>, isValid: boolean) => void;
  disabled?: boolean;
}

/**
 * Dynamic form generator from NodeType schema for create_node deltas.
 * Supports both single node type forms and compound forms with multiple steps.
 */
export function TaskFieldForm({
  nodeType,
  delta,
  compoundSteps,
  onValuesChange,
  disabled = false,
}: TaskFieldFormProps) {
  // For compound deltas with multiple create_node steps
  if (compoundSteps && compoundSteps.length > 0) {
    return (
      <CompoundFieldForm
        steps={compoundSteps}
        onValuesChange={onValuesChange}
        disabled={disabled}
      />
    );
  }

  // For single node type forms
  if (nodeType && delta) {
    return (
      <SingleNodeFieldForm
        nodeType={nodeType}
        delta={delta}
        onValuesChange={onValuesChange}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="text-sm text-muted-foreground text-center py-4">
      No form configuration available.
    </div>
  );
}

/**
 * Form for a single create_node delta.
 */
function SingleNodeFieldForm({
  nodeType,
  delta,
  onValuesChange,
  disabled = false,
}: SingleFormProps) {
  // Initialize form values from delta.initialValues
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    // Pre-populate from delta's initial values
    if (delta.initialValues) {
      Object.assign(initial, delta.initialValues);
    }
    return initial;
  });

  // Validate required fields
  const validateForm = useCallback(
    (values: Record<string, unknown>): boolean => {
      for (const field of nodeType.fields) {
        if (field.required) {
          const value = values[field.key];
          if (value === undefined || value === null || value === '') {
            return false;
          }
          // For arrays, check if not empty
          if (Array.isArray(value) && value.length === 0) {
            return false;
          }
        }
      }
      return true;
    },
    [nodeType.fields]
  );

  // Notify parent of value changes
  useEffect(() => {
    const isValid = validateForm(formValues);
    onValuesChange(formValues, isValid);
  }, [formValues, validateForm, onValuesChange]);

  // Handle field change
  const handleFieldChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Determine which fields are editable vs pre-filled
  const getFieldState = (field: Field): 'editable' | 'prefilled' | 'default' => {
    if (delta.initialValues && field.key in delta.initialValues) {
      // Value is pre-filled from delta - show as prefilled but allow editing
      return 'prefilled';
    }
    if (field.default !== undefined) {
      return 'default';
    }
    return 'editable';
  };

  // Get hint text for field
  const getFieldHint = (field: Field, state: 'editable' | 'prefilled' | 'default'): string | null => {
    if (state === 'prefilled') {
      return 'Pre-filled from task definition';
    }
    if (state === 'default') {
      return `Default: ${formatValue(field.default)}`;
    }
    return null;
  };

  if (nodeType.fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No fields to configure for this node type.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {nodeType.fields.map((field) => {
        const fieldState = getFieldState(field);
        const hint = getFieldHint(field, fieldState);

        return (
          <div key={field.key} className="space-y-1">
            <FieldInput
              field={field}
              value={formValues[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              disabled={disabled}
              showSuggestButton={false}
            />
            {hint && (
              <p className="text-xs text-muted-foreground ml-1">{hint}</p>
            )}
          </div>
        );
      })}

      {/* Show required fields summary */}
      {nodeType.fields.some((f) => f.required) && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Required fields must be filled before confirming
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Form for compound deltas with multiple create_node steps.
 * Collects values for all create_node steps and validates them together.
 */
function CompoundFieldForm({
  steps,
  onValuesChange,
  disabled = false,
}: CompoundFormProps) {
  // Values keyed by step.key
  const [formValues, setFormValues] = useState<Record<string, Record<string, unknown>>>(() => {
    const initial: Record<string, Record<string, unknown>> = {};
    for (const step of steps) {
      initial[step.key] = step.delta.initialValues ? { ...step.delta.initialValues } : {};
    }
    return initial;
  });

  // Handle values change for a specific step
  const handleStepValuesChange = useCallback((stepKey: string, values: Record<string, unknown>) => {
    setFormValues((prev) => ({
      ...prev,
      [stepKey]: values,
    }));
  }, []);

  // Validate all steps and emit combined values
  useEffect(() => {
    let allValid = true;
    for (const step of steps) {
      const stepValues = formValues[step.key] || {};
      for (const field of step.nodeType.fields) {
        if (field.required) {
          const value = stepValues[field.key];
          if (value === undefined || value === null || value === '') {
            allValid = false;
            break;
          }
          if (Array.isArray(value) && value.length === 0) {
            allValid = false;
            break;
          }
        }
      }
      if (!allValid) break;
    }
    onValuesChange(formValues, allValid);
  }, [formValues, steps, onValuesChange]);

  return (
    <div className="space-y-6">
      {steps.map((step, index) => (
        <div key={step.key} className="space-y-4">
          {/* Step header */}
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs font-medium">{index + 1}</span>
            </div>
            <h4 className="font-medium">{step.label || step.nodeType.displayName}</h4>
            <span className="text-xs text-muted-foreground">({step.nodeType.type})</span>
          </div>

          {/* Step form */}
          <StepFieldForm
            step={step}
            values={formValues[step.key] || {}}
            onValuesChange={(values) => handleStepValuesChange(step.key, values)}
            disabled={disabled}
          />
        </div>
      ))}

      {/* Show required fields summary */}
      {steps.some((s) => s.nodeType.fields.some((f) => f.required)) && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Required fields must be filled before confirming
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Form fields for a single step within a compound form.
 */
function StepFieldForm({
  step,
  values,
  onValuesChange,
  disabled,
}: {
  step: CompoundFormStep;
  values: Record<string, unknown>;
  onValuesChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const handleFieldChange = (key: string, value: unknown) => {
    onValuesChange({
      ...values,
      [key]: value,
    });
  };

  const getFieldState = (field: Field): 'editable' | 'prefilled' | 'default' => {
    if (step.delta.initialValues && field.key in step.delta.initialValues) {
      return 'prefilled';
    }
    if (field.default !== undefined) {
      return 'default';
    }
    return 'editable';
  };

  const getFieldHint = (field: Field, state: 'editable' | 'prefilled' | 'default'): string | null => {
    if (state === 'prefilled') {
      return 'Pre-filled from task definition';
    }
    if (state === 'default') {
      return `Default: ${formatValue(field.default)}`;
    }
    return null;
  };

  if (step.nodeType.fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-2">
        No fields to configure for this step.
      </div>
    );
  }

  return (
    <div className="space-y-4 pl-7">
      {step.nodeType.fields.map((field) => {
        const fieldState = getFieldState(field);
        const hint = getFieldHint(field, fieldState);

        return (
          <div key={field.key} className="space-y-1">
            <FieldInput
              field={field}
              value={values[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              disabled={disabled}
              showSuggestButton={false}
            />
            {hint && (
              <p className="text-xs text-muted-foreground ml-1">{hint}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
