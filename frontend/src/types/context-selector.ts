/**
 * TypeScript types for context selection in LLM suggestions.
 *
 * The ContextSelector enables composable graph traversals to gather context nodes.
 * Paths can branch from each other using `fromPath` to enable complex relational
 * queries like "siblings in the same project" or "documents belonging to my team members".
 */

export type Direction = 'outgoing' | 'incoming';
export type PropertyMode = 'all' | 'include' | 'exclude';

/**
 * A single edge traversal step.
 */
export interface EdgeStep {
  edgeType: string;
  direction: Direction;
}

/**
 * A named traversal path that gathers context nodes.
 *
 * Paths are executed in order, and later paths can reference earlier paths
 * via `fromPath` to continue traversing from those results.
 */
export interface ContextPath {
  /** Unique name for this path (used for referencing in fromPath). */
  name: string;

  /** Edge traversal steps from the starting point. */
  steps: EdgeStep[];

  /** Filter final nodes to this type. null = no type filter. */
  targetType?: string | null;

  /** Maximum nodes to include from this path. Default: 10. */
  maxCount?: number;

  /** Start from results of another path instead of source node. null = start from source. */
  fromPath?: string | null;

  /** Include nodes traversed along the way, not just final nodes. */
  includeIntermediate?: boolean;

  /** If true, query nodes by targetType globally instead of traversing from source. */
  globalQuery?: boolean;
}

/**
 * Configuration for which properties to include from nodes.
 */
export interface PropertySelector {
  /** all=include all, include=only listed, exclude=all except listed. */
  mode: PropertyMode;

  /** Field keys to include or exclude based on mode. */
  fields: string[];
}

/**
 * Full context configuration for LLM suggestions.
 */
export interface ContextSelector {
  /** Named traversal paths to gather context nodes. */
  paths: ContextPath[];

  /** Which properties to include from the source node. */
  sourceProperties: PropertySelector;

  /** Which properties to include from traversed context nodes. */
  contextProperties: PropertySelector;
}

/**
 * A node included in the context preview.
 */
export interface ContextPreviewNode {
  id: string;
  type: string;
  title: string;
  status?: string | null;
  properties: Record<string, unknown>;

  /** Which ContextPath this node came from. null for source node. */
  pathName?: string | null;

  /** How many hops from source (0 for source node itself). */
  traversalDepth: number;
}

/**
 * Preview of context that would be included in a suggestion.
 */
export interface ContextPreview {
  /** The source node being suggested from. */
  sourceNode: ContextPreviewNode;

  /** Nodes grouped by path name. */
  pathResults: Record<string, ContextPreviewNode[]>;

  /** Total number of context nodes (excluding source). */
  totalNodes: number;

  /** Estimated token count for this context. */
  totalTokensEstimate?: number | null;
}

/**
 * Request model for context preview endpoint.
 */
export interface ContextPreviewRequest {
  contextSelector: ContextSelector;
}

/**
 * Request model for parsing natural language to ContextSelector.
 */
export interface ParseContextSelectorRequest {
  description: string;
}

// ==================== Default Values ====================

export const DEFAULT_PROPERTY_SELECTOR: PropertySelector = {
  mode: 'all',
  fields: [],
};

/**
 * Create a default context selector for suggestions.
 *
 * When edgeType, direction, and targetType are provided, creates a selector
 * that includes existing sibling nodes of the target type - nodes that already
 * have the same relationship to the source node.
 *
 * Example: When suggesting an Analysis for a Sample (outgoing HAS_ANALYSIS edge),
 * this finds other Analysis nodes already connected to that Sample.
 */
export function createDefaultContextSelector(
  edgeType?: string,
  direction?: Direction,
  targetType?: string
): ContextSelector {
  const paths: ContextPath[] = [];

  if (edgeType && direction && targetType) {
    // Include existing sibling nodes - same type with same relationship to source
    // Direction matches the edge direction from source to target
    paths.push({
      name: 'siblings',
      steps: [{ edgeType, direction }],
      targetType,
      maxCount: 5,
    });
  } else {
    // Fallback: direct neighbors when context not provided
    paths.push({
      name: 'neighbors',
      steps: [],
      maxCount: 5,
    });
  }

  return {
    paths,
    sourceProperties: DEFAULT_PROPERTY_SELECTOR,
    contextProperties: DEFAULT_PROPERTY_SELECTOR,
  };
}

/**
 * Default context selector (direct neighbors) - for backwards compatibility.
 */
export const DEFAULT_CONTEXT_SELECTOR: ContextSelector = createDefaultContextSelector();

// ==================== Helper Functions ====================

/**
 * Create a simple neighbor selector.
 */
export function createNeighborPath(
  name: string,
  edgeType: string,
  direction: Direction,
  targetType?: string,
  maxCount = 10
): ContextPath {
  return {
    name,
    steps: [{ edgeType, direction }],
    targetType,
    maxCount,
  };
}

/**
 * Create a sibling selector (nodes sharing the same parent).
 *
 * Example: createSiblingPath('sibling_issues', 'BELONGS_TO', 'Project', 'Issue')
 * Gets all Issues that belong to the same Project as the source.
 */
export function createSiblingPath(
  name: string,
  edgeToParent: string,
  parentType: string,
  siblingType: string,
  maxCount = 10
): ContextPath[] {
  const parentPathName = `${name}_parent`;
  return [
    {
      name: parentPathName,
      steps: [{ edgeType: edgeToParent, direction: 'outgoing' }],
      targetType: parentType,
      maxCount: 1,
    },
    {
      name,
      steps: [{ edgeType: edgeToParent, direction: 'incoming' }],
      targetType: siblingType,
      fromPath: parentPathName,
      maxCount,
    },
  ];
}

/**
 * Create a global query path (query by type, not relative to source).
 */
export function createGlobalPath(
  name: string,
  targetType: string,
  maxCount = 5
): ContextPath {
  return {
    name,
    steps: [],
    targetType,
    maxCount,
    globalQuery: true,
  };
}
