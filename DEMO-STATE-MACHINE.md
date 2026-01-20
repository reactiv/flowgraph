# State Machine Demo: "Compliance-as-Code"

A killer feature demonstration showing how natural language rules become live enforcement in the workflow engine.

## Demo Concept

**Tagline**: "Describe your compliance rules in plain English. Watch them enforce themselves."

**Value Proposition**: Organizations spend massive effort encoding business rules into software. This demo shows how a workflow engine can:
1. Accept rules in natural language
2. Convert them to enforceable constraints
3. Block invalid state transitions in real-time
4. Show users exactly what they need to do to proceed

## Demo Script (3-5 minutes)

### Act 1: Set the Stage (30 seconds)

Start with a pre-seeded "Document Approval" workflow:
- **Documents**: Main entities with states (Draft → Review → Approved/Rejected)
- **Reviews**: Linked review records
- **Approvers**: People who can approve

Show the graph view with a few documents in various states.

### Act 2: Add Rules via Natural Language (60 seconds)

Open a "Workflow Rules" panel. Type in plain English:

> "A document cannot be approved until it has at least 2 reviews"

Click "Add Rule". The system:
1. Parses the natural language
2. Shows the generated rule in structured form:
   ```
   Rule: require_reviews_for_approval
   When: Document transitions to "Approved"
   Requires: At least 2 HAS_REVIEW edges
   Message: "Documents require at least 2 reviews before approval"
   ```
3. Adds the rule to the workflow schema

Add another rule:

> "Rejected documents cannot be edited without manager approval"

### Act 3: See the Rules Block Transitions (90 seconds)

**Scenario A: Missing Reviews**
1. Click on a Document in "Review" state that has only 1 review
2. Open status dropdown - "Approved" is visible but marked with ⚠️
3. Click "Approved" anyway
4. **Toast notification appears**:
   ```
   ❌ Cannot approve document

   Rule violated: require_reviews_for_approval
   "Documents require at least 2 reviews before approval"

   Current: 1 review
   Required: 2 reviews

   [Add Review] [Dismiss]
   ```
5. The status does NOT change

**Scenario B: Satisfying the Rule**
1. Add a second review to the document (create edge)
2. Try the transition again
3. **Success!** Status changes to "Approved"
4. Event logged: "Document approved after satisfying 2-review requirement"

### Act 4: Visual Rule Explorer (30 seconds)

Open a "State Machine" visualization panel showing:
- States as nodes in a mini-graph
- Transitions as edges
- Rules as annotations on transitions
- Current document position highlighted

This visual makes the state machine tangible.

### Act 5: The Payoff (30 seconds)

"You just created compliance rules in plain English that are now enforced across your entire workflow. No code changes. No deployment. Instant governance."

---

## Implementation Plan

### Phase 1: Backend Rule Enforcement (Core)

#### 1.1 Transition Validation Endpoint

**New endpoint**: `POST /api/v1/workflows/{id}/nodes/{node_id}/validate-transition`

```python
# Request
{
  "target_status": "Approved"
}

# Response (success)
{
  "valid": true,
  "current_status": "Review",
  "target_status": "Approved",
  "rules_checked": ["require_reviews_for_approval"],
  "rules_passed": ["require_reviews_for_approval"]
}

# Response (failure)
{
  "valid": false,
  "current_status": "Review",
  "target_status": "Approved",
  "violations": [
    {
      "rule_id": "require_reviews_for_approval",
      "message": "Documents require at least 2 reviews before approval",
      "requirement": {
        "edge_type": "HAS_REVIEW",
        "min_count": 2,
        "current_count": 1
      }
    }
  ]
}
```

#### 1.2 Enforce on PATCH /nodes/{id}

Modify existing endpoint to validate rules before allowing status changes:

```python
# backend/app/api/nodes.py

async def update_node(...):
    # If status is changing, validate rules first
    if "status" in update_data:
        validation = await validate_transition(
            workflow_id, node_id, update_data["status"]
        )
        if not validation.valid:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "rule_violation",
                    "violations": validation.violations
                }
            )
    # ... proceed with update
```

#### 1.3 Rule Evaluation Engine

```python
# backend/app/rules/engine.py

class RuleEngine:
    """Evaluates workflow rules against node state."""

    async def evaluate_transition(
        self,
        workflow: Workflow,
        node: Node,
        target_status: str
    ) -> RuleEvaluationResult:
        """Check all applicable rules for a state transition."""

        applicable_rules = self._get_rules_for_transition(
            workflow.definition.rules,
            node.type,
            target_status
        )

        violations = []
        for rule in applicable_rules:
            if not await self._check_rule(workflow, node, rule):
                violations.append(RuleViolation(
                    rule_id=rule.id,
                    message=rule.message,
                    requirement=rule.require_edges[0] if rule.require_edges else None,
                    current_state=await self._get_current_state(workflow, node, rule)
                ))

        return RuleEvaluationResult(
            valid=len(violations) == 0,
            violations=violations
        )
```

### Phase 2: Natural Language Rule Generation

#### 2.1 Rule Generation Endpoint

**New endpoint**: `POST /api/v1/workflows/{id}/rules/generate`

```python
# Request
{
  "description": "A document cannot be approved until it has at least 2 reviews"
}

# Response
{
  "rule": {
    "id": "require_reviews_for_approval",
    "when": {
      "nodeType": "Document",
      "transitionTo": "Approved"
    },
    "requireEdges": [
      {"edgeType": "HAS_REVIEW", "minCount": 2}
    ],
    "message": "Documents require at least 2 reviews before approval"
  },
  "interpretation": {
    "trigger": "Document → Approved transition",
    "constraint": "Must have ≥2 HAS_REVIEW edges",
    "natural_language": "A document cannot be approved until it has at least 2 reviews"
  }
}
```

#### 2.2 Rule Generator LLM Prompt

```python
RULE_GENERATION_SYSTEM = """You are a workflow rule generator.
Given a natural language description of a business rule, generate a Rule JSON.

## Available Context
You will receive:
- The workflow schema (node types, edge types, states)
- A natural language rule description

## Rule Structure
{
  "id": "snake_case_rule_id",
  "when": {
    "nodeType": "NodeTypeName",
    "transitionTo": "TargetState"  // optional
  },
  "requireEdges": [
    {"edgeType": "EDGE_TYPE", "minCount": 1}
  ],
  "message": "Human-readable explanation of the rule"
}

## Guidelines
1. Parse the natural language to identify:
   - Which node type the rule applies to
   - Which state transition triggers the rule (if any)
   - What edges/relationships are required

2. Map natural language to schema elements:
   - "reviews" → look for Review node type and HAS_REVIEW edge
   - "approved" → look for "Approved" state
   - "at least N" → minCount: N

3. Generate clear, actionable messages that tell users what to do
"""
```

#### 2.3 Add Rule to Workflow

**New endpoint**: `POST /api/v1/workflows/{id}/rules`

```python
# Request
{
  "rule": { ... generated rule ... }
}

# Response
{
  "success": true,
  "workflow_id": "...",
  "rule_count": 3
}
```

This mutates the workflow definition to add the new rule.

### Phase 3: Frontend Rule Visualization

#### 3.1 Rule Violation Toast

When a transition is blocked, show a rich toast:

```tsx
// components/rules/RuleViolationToast.tsx

interface RuleViolationToastProps {
  violation: RuleViolation;
  onAddEdge?: () => void;  // Quick action to satisfy rule
  onDismiss: () => void;
}

function RuleViolationToast({ violation, onAddEdge, onDismiss }) {
  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
      <div className="flex items-start">
        <XCircle className="text-red-500 mr-3" />
        <div className="flex-1">
          <h4 className="font-medium text-red-800">
            Cannot complete transition
          </h4>
          <p className="text-red-700 mt-1">{violation.message}</p>

          {violation.requirement && (
            <div className="mt-2 text-sm text-red-600">
              <span className="font-medium">Current:</span>{' '}
              {violation.requirement.current_count} {violation.requirement.edge_type}
              <br />
              <span className="font-medium">Required:</span>{' '}
              {violation.requirement.min_count} {violation.requirement.edge_type}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            {onAddEdge && (
              <Button size="sm" onClick={onAddEdge}>
                Add {violation.requirement?.edge_type}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### 3.2 Enhanced Status Dropdown

Show rule status on transitions:

```tsx
// components/node-detail/StatusDropdown.tsx (enhanced)

// For each transition, show if rules apply
{validTransitions.map((status) => {
  const rulesApply = getRulesForTransition(currentStatus, status);
  const canTransition = rulesApply.length === 0 || allRulesSatisfied;

  return (
    <button
      key={status}
      onClick={() => attemptTransition(status)}
      className={cn(
        'flex items-center justify-between',
        !canTransition && 'opacity-50'
      )}
    >
      <span>{status}</span>
      {rulesApply.length > 0 && (
        <span className="text-xs">
          {canTransition ? '✓' : '⚠️'} {rulesApply.length} rule(s)
        </span>
      )}
    </button>
  );
})}
```

#### 3.3 Rules Panel

Add a "Rules" tab to the workflow view:

```tsx
// components/rules/RulesPanel.tsx

function RulesPanel({ workflowId, definition }) {
  const [newRuleText, setNewRuleText] = useState('');
  const generateRule = useMutation(/* ... */);
  const addRule = useMutation(/* ... */);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Workflow Rules</h3>

      {/* Natural language input */}
      <div className="flex gap-2">
        <Input
          value={newRuleText}
          onChange={(e) => setNewRuleText(e.target.value)}
          placeholder="Describe a rule in plain English..."
          className="flex-1"
        />
        <Button onClick={() => generateRule.mutate(newRuleText)}>
          Add Rule
        </Button>
      </div>

      {/* Generated rule preview */}
      {generateRule.data && (
        <RulePreview
          rule={generateRule.data.rule}
          onConfirm={() => addRule.mutate(generateRule.data.rule)}
          onCancel={() => generateRule.reset()}
        />
      )}

      {/* Existing rules */}
      <div className="space-y-2">
        {definition.rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}
```

#### 3.4 State Machine Visualizer

A dedicated view showing the state machine as a graph:

```tsx
// components/rules/StateMachineView.tsx

function StateMachineView({ nodeType, currentStatus }) {
  const states = nodeType.states;

  // Build React Flow nodes from states
  const nodes = states.values.map((state, i) => ({
    id: state,
    data: {
      label: state,
      isCurrent: state === currentStatus,
      isInitial: state === states.initial
    },
    position: { x: i * 150, y: 100 }
  }));

  // Build edges from transitions
  const edges = states.transitions.map((t) => ({
    id: `${t.from}-${t.to}`,
    source: t.from,
    target: t.to,
    label: getRulesForTransition(t.from, t.to).length > 0
      ? '⚠️ Rules'
      : undefined
  }));

  return (
    <ReactFlow nodes={nodes} edges={edges}>
      <Background />
      <Controls />
    </ReactFlow>
  );
}
```

---

## Demo Workflow Template

Create `backend/templates/document-approval.workflow.json`:

```json
{
  "workflowId": "document_approval",
  "name": "Document Approval",
  "description": "Demo workflow showcasing state machine rules enforcement",
  "nodeTypes": [
    {
      "type": "Document",
      "displayName": "Document",
      "titleField": "title",
      "subtitleField": "author",
      "fields": [
        {"key": "doc_id", "label": "Document ID", "kind": "string", "required": true},
        {"key": "title", "label": "Title", "kind": "string", "required": true},
        {"key": "author", "label": "Author", "kind": "person", "required": true},
        {"key": "content", "label": "Content", "kind": "string"},
        {"key": "created_at", "label": "Created", "kind": "datetime"}
      ],
      "states": {
        "enabled": true,
        "initial": "Draft",
        "values": ["Draft", "Review", "Approved", "Rejected"],
        "transitions": [
          {"from": "Draft", "to": "Review"},
          {"from": "Review", "to": "Approved"},
          {"from": "Review", "to": "Rejected"},
          {"from": "Rejected", "to": "Draft"}
        ]
      }
    },
    {
      "type": "Review",
      "displayName": "Review",
      "titleField": "reviewer",
      "fields": [
        {"key": "reviewer", "label": "Reviewer", "kind": "person", "required": true},
        {"key": "verdict", "label": "Verdict", "kind": "enum", "values": ["Approve", "Request Changes", "Reject"]},
        {"key": "comments", "label": "Comments", "kind": "string"},
        {"key": "reviewed_at", "label": "Reviewed At", "kind": "datetime"}
      ],
      "states": {
        "enabled": true,
        "initial": "Pending",
        "values": ["Pending", "Complete"],
        "transitions": [
          {"from": "Pending", "to": "Complete"}
        ]
      }
    }
  ],
  "edgeTypes": [
    {
      "type": "HAS_REVIEW",
      "displayName": "has review",
      "from": "Document",
      "to": "Review",
      "direction": "out"
    }
  ],
  "rules": []
}
```

---

## Implementation Priority

### Must Have (for demo)
1. **Rule enforcement on PATCH** - Backend blocks invalid transitions
2. **Rule violation response** - API returns violation details
3. **Toast notification** - Frontend shows why transition failed
4. **Demo workflow** - Document approval template

### Should Have (enhances demo)
5. **Natural language rule generation** - `/rules/generate` endpoint
6. **Rules panel** - UI to add rules via NL
7. **Rule preview** - Show generated rule before adding

### Nice to Have (polish)
8. **State machine visualizer** - React Flow mini-graph
9. **Enhanced status dropdown** - Show rule indicators
10. **Quick actions** - "Add Review" button in toast

---

## File Changes Summary

### New Files
```
backend/app/rules/
├── __init__.py
├── engine.py          # Rule evaluation logic
└── models.py          # RuleViolation, RuleEvaluationResult

backend/app/llm/rule_generator.py     # NL → Rule conversion
backend/templates/document-approval.workflow.json

frontend/src/components/rules/
├── RuleViolationToast.tsx
├── RulesPanel.tsx
├── RuleCard.tsx
├── RulePreview.tsx
└── StateMachineView.tsx
```

### Modified Files
```
backend/app/api/nodes.py      # Add rule validation to PATCH
backend/app/api/workflows.py  # Add /rules/generate, /rules endpoints

frontend/src/components/node-detail/StatusDropdown.tsx  # Rule indicators
frontend/src/components/node-detail/NodeDetailPanel.tsx # Integrate toast
frontend/src/app/workflows/[id]/page.tsx  # Add Rules tab
```

---

## Success Metrics

The demo succeeds if the audience:
1. **Understands** - They grasp that rules are defined in NL and enforced automatically
2. **Believes** - They see real enforcement happening, not just UI theater
3. **Wants** - They imagine their own use cases for this capability
4. **Remembers** - The "blocked transition → satisfy rule → succeed" flow sticks

---

## Demo Environment Setup

```bash
# 1. Start the stack
./scripts/dc up -d

# 2. Create document approval workflow from template
curl -X POST http://localhost:8000/api/v1/workflows/from-template \
  -H "Content-Type: application/json" \
  -d '{"template_id": "document_approval"}'

# 3. Seed with demo data
curl -X POST http://localhost:8000/api/v1/workflows/{id}/seed \
  -H "Content-Type: application/json" \
  -d '{"scale": "medium"}'

# 4. Open frontend
open http://localhost:3000/workflows/{id}
```
