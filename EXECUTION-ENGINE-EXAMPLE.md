# Execution Engine Example: CAPA Workflow

A practical walkthrough of how the Execution Engine transforms the CAPA (Corrective and Preventive Action) workflow from a passive visualization tool into an active workflow management system.

---

## The CAPA Workflow

The CAPA workflow tracks quality issues from discovery to resolution:

```
┌─────────────────┐     ┌───────────────┐     ┌────────────┐
│ Nonconformance  │────▶│ Investigation │────▶│ Root Cause │
│ (Quality Issue) │     │ (Analysis)    │     │ (Finding)  │
└─────────────────┘     └───────┬───────┘     └─────┬──────┘
                                │                   │
                                ▼                   ▼
                        ┌───────────────┐   ┌─────────────┐
                        │  CAPA Action  │◀──│  addresses  │
                        │ (Fix/Prevent) │   └─────────────┘
                        └───────┬───────┘
                                │
                                ▼
                        ┌───────────────┐
                        │ Verification  │
                        │ (Confirm Fix) │
                        └───────────────┘
```

### Node Types and States

| Node Type | States | Key Fields |
|-----------|--------|------------|
| **Nonconformance** | Open → Under Investigation → Pending Actions → Pending Verification → Closed | severity, category, reported_by |
| **Investigation** | Planning → In Progress → Analysis → Complete | investigator, methodology, findings |
| **RootCause** | Proposed → Confirmed → Addressed | category, evidence_summary |
| **CAPAAction** | Open → In Progress → Completed → Pending Verification → Verified | action_type, assigned_to, due_date |
| **Verification** | Scheduled → In Progress → Complete | verifier, method, result |

### Existing Rules (Validation Only)

```json
{
  "id": "nc_requires_investigation_before_pending_actions",
  "when": { "nodeType": "Nonconformance", "transitionTo": "Pending Actions" },
  "requireEdges": [{ "edgeType": "TRIGGERS", "minCount": 1 }],
  "message": "A Nonconformance must have at least 1 Investigation"
}
```

**Today**: These rules only *validate* transitions. Users must manually create nodes, edges, and change states.

---

## How It Works Today (Without Execution Engine)

### Manual Process

```
1. User creates Nonconformance node (status: Open)
2. User manually creates Investigation node
3. User manually creates TRIGGERS edge
4. User manually changes NC status to "Under Investigation"
5. User manually changes Investigation status through states
6. User manually creates RootCause nodes
7. User manually creates IDENTIFIES edges
8. ... and so on for every state change
```

### Problems

- **No task assignment**: Who should investigate? Who should verify?
- **No deadlines**: When is the action overdue?
- **No automation**: Every click is manual
- **No notifications**: Users must check the system constantly
- **No accountability**: No audit trail of who did what when

---

## With the Execution Engine

### Scenario: Critical Equipment Failure

Let's walk through a realistic scenario where a critical equipment failure is detected, investigated, and resolved.

---

### Step 1: Nonconformance Reported

**Trigger**: QA technician discovers equipment malfunction and creates a Nonconformance.

```http
POST /api/v1/workflows/capa_v1/nodes
{
  "type": "Nonconformance",
  "properties": {
    "nc_id": "NC-2024-0142",
    "title": "Bioreactor BR-007 Temperature Control Failure",
    "description": "Temperature exceeded 39°C during batch production, potentially affecting product quality",
    "reported_by": "Maria Chen",
    "reported_date": "2024-01-15T14:30:00Z",
    "severity": "Critical",
    "category": "Equipment",
    "area_affected": "Manufacturing Floor B",
    "immediate_action": "Batch quarantined, equipment taken offline"
  }
}
```

**Execution Engine Actions**:

```yaml
Event: node.created
  Node: NC-2024-0142
  Type: Nonconformance
  Status: Open (initial)

Rules Triggered:
  1. rule:critical_nc_requires_immediate_investigation
     Condition: severity == "Critical"
     Actions:
       - Create human task: "Assign investigator for critical NC"
       - Set SLA timer: 4 hours to assign
       - Send notification: QA Manager group

  2. rule:nc_auto_create_investigation
     Condition: always on NC creation
     Actions:
       - Create Investigation node (linked)
       - Create TRIGGERS edge automatically

Tasks Created:
  - Task #1: "Assign Lead Investigator"
    Type: human
    Assignee: QA Manager (role-based)
    Priority: critical
    Due: 4 hours
    SLA: escalate to Plant Manager if not assigned
```

**Automatic Node Creation**:

```yaml
Investigation Created Automatically:
  ID: INV-2024-0089
  Title: "Investigation: Bioreactor BR-007 Temperature Control Failure"
  Status: Planning
  Fields:
    - methodology: null (to be selected)
    - target_completion: 2024-01-22 (7 days from NC)

Edge Created:
  - NC-2024-0142 --[TRIGGERS]--> INV-2024-0089
```

---

### Step 2: Investigation Assigned

**Trigger**: QA Manager claims and completes Task #1 by assigning an investigator.

```http
POST /api/v1/workflows/capa_v1/tasks/task_001/complete
{
  "result": {
    "type": "success",
    "data": {
      "investigator": "Dr. James Park",
      "methodology": "5 Why"
    }
  }
}
```

**Execution Engine Actions**:

```yaml
Event: task.completed
  Task: task_001
  Result: success

Rules Triggered:
  1. rule:investigation_assigned_start_work
     Condition: investigator field populated
     Actions:
       - Transition Investigation: Planning → In Progress
       - Create human task: "Conduct investigation"
       - Set SLA timer: 5 days to complete investigation
       - Send notification to investigator

  2. rule:nc_investigation_started
     Condition: linked Investigation moved to In Progress
     Actions:
       - Transition Nonconformance: Open → Under Investigation
       - Log event: "Investigation started by Dr. James Park"

State Changes:
  - INV-2024-0089: Planning → In Progress (automatic)
  - NC-2024-0142: Open → Under Investigation (automatic cascade)

Tasks Created:
  - Task #2: "Conduct 5-Why Analysis for BR-007 Failure"
    Type: human
    Assignee: Dr. James Park
    Priority: high
    Due: 2024-01-20 (5 days)
    Instructions: |
      1. Review equipment logs and maintenance history
      2. Interview operators on shift during incident
      3. Document the 5-Why analysis
      4. Identify root cause(s)
      5. Propose corrective actions

Timers Set:
  - Timer #1: Investigation SLA
    Fires: 2024-01-20T17:00:00Z
    Action: escalate_to_qa_manager

  - Timer #2: Daily progress reminder
    Fires: daily at 09:00
    Action: send_reminder to Dr. James Park
```

---

### Step 3: Agent Assists Investigation

**Trigger**: Investigator requests AI assistance to analyze equipment logs.

```http
POST /api/v1/workflows/capa_v1/nodes/inv_0089/tasks
{
  "task_type": "agent",
  "title": "Analyze equipment logs for anomalies",
  "instructions": "Review the attached equipment logs from BR-007 for the week leading up to the incident. Identify any anomalies, patterns, or warning signs that preceded the temperature failure."
}
```

**Agent Execution**:

```yaml
Agent Task Created:
  - Task #3: "Analyze equipment logs for anomalies"
    Type: agent
    Agent: analysis-agent
    Status: in_progress

Agent Actions (via tools):
  1. get_connected_nodes(inv_0089, "TRIGGERS", reverse=true)
     → Returns NC-2024-0142 with equipment details

  2. read_attachment(nc_0142, "equipment_logs.csv")
     → Reads 7 days of temperature/pressure data

  3. analyze_data(...)
     → Identifies pattern: temperature drift started 3 days prior
     → Finds: calibration was due 2 weeks ago but not performed

  4. update_node(inv_0089, findings=analysis_summary)
     → Updates investigation with findings

  5. suggest_root_cause(
       description="Missed calibration led to sensor drift",
       category="Process Gap",
       evidence="Temperature readings show 0.5°C/day drift starting 2024-01-12"
     )
     → Creates suggested RootCause for human review

  6. complete_task(result="success", summary="...")

Agent Result:
  status: success
  tokens_used: 12,450
  duration: 45 seconds
  output:
    findings: |
      Analysis of BR-007 logs reveals:
      1. Temperature sensor showed gradual drift starting 2024-01-12
      2. Calibration was due 2024-01-01 but not performed
      3. No alerts triggered due to drift being within daily tolerance

      Suggested root cause: Missed preventive maintenance (calibration)
```

**Execution Engine Actions**:

```yaml
Event: task.completed
  Task: task_003 (agent)
  Result: success

Rules Triggered:
  1. rule:agent_findings_require_review
     Condition: agent task completed with suggested_root_cause
     Actions:
       - Create human task: "Review AI-suggested root cause"
       - Add review_pending flag to suggested RootCause

Tasks Created:
  - Task #4: "Review AI-suggested root cause"
    Type: human
    Assignee: Dr. James Park
    Context:
      - Agent analysis summary
      - Suggested root cause details
      - Link to evidence
```

---

### Step 4: Root Cause Confirmed

**Trigger**: Investigator reviews and confirms the AI-suggested root cause.

```http
POST /api/v1/workflows/capa_v1/nodes/rc_001/transition
{
  "to_state": "Confirmed",
  "trigger": { "type": "manual", "source": "user_james_park" },
  "metadata": {
    "confirmation_notes": "Verified against maintenance schedule. Calibration was indeed missed."
  }
}
```

**Execution Engine Actions**:

```yaml
Event: node.state_changed
  Node: RC-001
  From: Proposed
  To: Confirmed

Rules Triggered:
  1. rule:confirmed_root_cause_needs_capa
     Condition: RootCause transitions to Confirmed
     Actions:
       - Create human task: "Define corrective/preventive actions"
       - Suggest CAPA actions based on root cause category

  2. rule:investigation_has_confirmed_root_cause
     Condition: linked RootCause is Confirmed
     Actions:
       - Transition Investigation: In Progress → Analysis
       - Cancel daily reminder timer

State Changes:
  - INV-2024-0089: In Progress → Analysis (automatic)

Tasks Created:
  - Task #5: "Define CAPA Actions for: Missed calibration"
    Type: human
    Assignee: Dr. James Park
    Due: 2024-01-18 (2 days)
    Suggestions:
      - Corrective: "Re-calibrate BR-007 temperature sensor"
      - Preventive: "Implement automated calibration reminders"
      - Preventive: "Add redundant temperature monitoring"
```

---

### Step 5: CAPA Actions Created

**Trigger**: Investigator creates corrective and preventive actions.

```http
POST /api/v1/workflows/capa_v1/nodes
{
  "type": "CAPAAction",
  "properties": {
    "action_id": "CA-2024-0201",
    "title": "Re-calibrate BR-007 temperature sensor",
    "action_type": "Corrective",
    "description": "Perform full calibration of temperature sensor per SOP-CAL-001",
    "assigned_to": "Mike Wilson",
    "due_date": "2024-01-17T17:00:00Z"
  },
  "edges": [
    { "type": "ADDRESSES", "to": "rc_001" },
    { "type": "PRODUCES", "from": "inv_0089" }
  ]
}
```

**Execution Engine Actions**:

```yaml
Event: node.created
  Node: CA-2024-0201
  Type: CAPAAction
  Status: Open

Rules Triggered:
  1. rule:capa_action_created
     Actions:
       - Create human task for assignee
       - Set due date timer
       - Send notification to assignee

  2. rule:overdue_warning
     Condition: 24 hours before due_date
     Actions:
       - Schedule warning notification

Tasks Created:
  - Task #6: "Complete: Re-calibrate BR-007 temperature sensor"
    Type: human
    Assignee: Mike Wilson
    Due: 2024-01-17
    Status: pending

Timers Set:
  - Timer #3: Due date warning
    Fires: 2024-01-16T17:00:00Z (24h before)
    Action: send_warning_notification

  - Timer #4: Overdue check
    Fires: 2024-01-17T17:00:00Z
    Action: transition_to_overdue
```

---

### Step 6: Action Completed

**Trigger**: Technician completes the calibration and marks task done.

```http
POST /api/v1/workflows/capa_v1/tasks/task_006/complete
{
  "result": {
    "type": "success",
    "data": {
      "completion_notes": "Calibration completed per SOP-CAL-001. New certificate attached.",
      "attachments": ["cal_cert_br007_20240117.pdf"]
    }
  }
}
```

**Execution Engine Actions**:

```yaml
Event: task.completed
  Task: task_006
  Result: success

Rules Triggered:
  1. rule:capa_completed_needs_verification
     Condition: CAPAAction task completed successfully
     Actions:
       - Transition CAPAAction: Open → Completed
       - Create Verification node
       - Create VERIFIED_BY edge
       - Create human task for verification
       - Cancel overdue timer

State Changes:
  - CA-2024-0201: In Progress → Completed (automatic)

Nodes Created:
  - Verification VER-2024-0156
    Title: "Verify: BR-007 calibration"
    Status: Scheduled
    Method: "Document Review" (suggested)

Edges Created:
  - CA-2024-0201 --[VERIFIED_BY]--> VER-2024-0156

Tasks Created:
  - Task #7: "Verify calibration was effective"
    Type: human
    Assignee: QA Specialist (role-based, not original assignee)
    Due: 2024-01-19 (2 days)
    Instructions: |
      1. Review calibration certificate
      2. Confirm sensor readings are within spec
      3. Verify SOP was followed

Timers Cancelled:
  - Timer #3 (warning) - no longer needed
  - Timer #4 (overdue) - completed on time
```

---

### Step 7: Verification and Closure

**Trigger**: QA Specialist verifies the corrective action was effective.

```http
POST /api/v1/workflows/capa_v1/nodes/ver_0156/transition
{
  "to_state": "Complete",
  "trigger": { "type": "manual", "source": "user_sarah_kim" },
  "metadata": {
    "result": "Effective",
    "notes": "Calibration certificate valid. Readings confirmed within ±0.1°C spec."
  }
}
```

**Execution Engine Actions**:

```yaml
Event: node.state_changed
  Node: VER-2024-0156
  From: In Progress
  To: Complete

Rules Triggered:
  1. rule:verification_complete_update_capa
     Condition: Verification result == "Effective"
     Actions:
       - Transition CAPAAction: Completed → Verified
       - Update RootCause: Confirmed → Addressed

  2. rule:all_actions_verified_check_nc_closure
     Condition: All CAPAActions for NC are Verified
     Actions:
       - Check if NC can be closed
       - Create closure task if all conditions met

State Changes (Cascading):
  - VER-2024-0156: In Progress → Complete
  - CA-2024-0201: Completed → Verified (automatic)
  - RC-001: Confirmed → Addressed (automatic)

Closure Check:
  NC-2024-0142 closure requirements:
    ✓ Has Investigation (TRIGGERS edge)
    ✓ Investigation is Complete
    ✓ All RootCauses are Addressed
    ✓ All CAPAActions are Verified

  Result: Ready for closure

Tasks Created:
  - Task #8: "Approve NC closure"
    Type: human
    Assignee: QA Manager
    Due: 2024-01-21
    Context:
      - Full CAPA summary
      - All verification results
      - Timeline of actions
```

---

### Step 8: Final Closure

**Trigger**: QA Manager approves closure.

```http
POST /api/v1/workflows/capa_v1/nodes/nc_0142/transition
{
  "to_state": "Closed",
  "trigger": { "type": "manual", "source": "user_qa_manager" },
  "metadata": {
    "closure_summary": "Root cause identified and addressed. Preventive measures implemented."
  }
}
```

**Execution Engine Actions**:

```yaml
Event: node.state_changed
  Node: NC-2024-0142
  From: Pending Verification
  To: Closed

Validation Check:
  Rule: nc_requires_verified_action_before_close
    ✓ Has TRIGGERS edge to Investigation
    ✓ Investigation has IDENTIFIES edge to RootCause
    ✓ RootCause has ADDRESSES edge from CAPAAction
    ✓ CAPAAction has VERIFIED_BY edge to Verification
    ✓ Verification result is "Effective"

  Result: Transition ALLOWED

Rules Triggered:
  1. rule:nc_closed_complete_investigation
     Actions:
       - Transition Investigation: Analysis → Complete
       - Generate closure report
       - Archive related documents

  2. rule:nc_closed_notify_stakeholders
     Actions:
       - Send notification: Reporter, Investigator, QA Manager
       - Create audit record

Final State Changes:
  - NC-2024-0142: Pending Verification → Closed
  - INV-2024-0089: Analysis → Complete (automatic)

Report Generated:
  - CAPA Closure Report for NC-2024-0142
  - Includes: timeline, root causes, actions, verifications
  - Stored as attachment on NC node
```

---

## Complete Execution Timeline

```
Day 0 (14:30)  NC Created ─────────────────────────────────────────┐
               │ Automatic: Investigation created                   │
               │ Task: Assign investigator (4hr SLA)                │
                                                                    │
Day 0 (16:00)  Task #1 Completed ──────────────────────────────────┤
               │ Investigator: Dr. James Park                       │
               │ Automatic: NC → Under Investigation                │
               │ Automatic: INV → In Progress                       │
               │ Task: Conduct investigation (5 day SLA)            │
                                                                    │
Day 2 (10:00)  Agent Task ─────────────────────────────────────────┤
               │ Agent analyzes equipment logs                      │
               │ Suggests root cause (45 seconds)                   │
               │ Task: Review AI suggestion                         │
                                                                    │
Day 2 (14:00)  Root Cause Confirmed ───────────────────────────────┤
               │ Automatic: INV → Analysis                          │
               │ Task: Define CAPA actions                          │
                                                                    │
Day 3 (09:00)  CAPA Actions Created ───────────────────────────────┤
               │ Corrective: Re-calibrate sensor                    │
               │ Preventive: Automated reminders                    │
               │ Tasks assigned to technicians                      │
                                                                    │
Day 4 (15:00)  Corrective Action Completed ────────────────────────┤
               │ Automatic: Verification created                    │
               │ Task: Verify calibration                           │
                                                                    │
Day 6 (11:00)  Verification Complete ──────────────────────────────┤
               │ Result: Effective                                  │
               │ Automatic: CAPAAction → Verified                   │
               │ Automatic: RootCause → Addressed                   │
               │ Task: Approve NC closure                           │
                                                                    │
Day 7 (09:00)  NC Closed ──────────────────────────────────────────┘
               │ Automatic: Investigation → Complete
               │ Closure report generated
               │ Stakeholders notified

Total Duration: 7 days (well within typical 30-day CAPA target)
Human Tasks: 8
Agent Tasks: 1
Automatic Transitions: 7
Timers Used: 4
```

---

## Execution Rules for CAPA Workflow

Here are the complete execution rules that enable this automation:

```python
execution_rules = [
    # === NC Creation Rules ===
    {
        "id": "critical_nc_immediate_response",
        "name": "Critical NC Requires Immediate Response",
        "trigger": {"type": "event", "event_types": ["node.created"]},
        "when": {
            "node_type": "Nonconformance",
            "field_conditions": [{"field": "severity", "op": "eq", "value": "Critical"}]
        },
        "then": [
            {"type": "create_task", "params": {
                "title": "Assign investigator for critical NC",
                "task_type": "human",
                "assignee": {"type": "group", "id": "qa_managers"},
                "priority": 10,
                "due_delta": "PT4H"  # 4 hours
            }},
            {"type": "schedule_action", "params": {
                "action_type": "escalate",
                "delay": "PT4H",
                "params": {"to": "plant_manager", "reason": "Critical NC not assigned"}
            }},
            {"type": "send_notification", "params": {
                "to": {"type": "group", "id": "qa_managers"},
                "template": "critical_nc_created"
            }}
        ]
    },

    {
        "id": "nc_auto_create_investigation",
        "name": "Auto-create Investigation for NC",
        "trigger": {"type": "event", "event_types": ["node.created"]},
        "when": {"node_type": "Nonconformance"},
        "then": [
            {"type": "create_node", "params": {
                "node_type": "Investigation",
                "title_template": "Investigation: {source.title}",
                "fields": {
                    "target_completion": "{source.reported_date + P7D}"
                }
            }},
            {"type": "create_edge", "params": {
                "edge_type": "TRIGGERS",
                "from": "{source.id}",
                "to": "{created_node.id}"
            }}
        ]
    },

    # === Investigation Rules ===
    {
        "id": "investigation_assigned_start",
        "name": "Start Investigation When Assigned",
        "trigger": {"type": "event", "event_types": ["node.updated"]},
        "when": {
            "node_type": "Investigation",
            "field_conditions": [
                {"field": "investigator", "op": "changed_to", "value": {"not": null}}
            ]
        },
        "then": [
            {"type": "transition_state", "params": {"to_state": "In Progress"}},
            {"type": "create_task", "params": {
                "title": "Conduct investigation: {node.title}",
                "task_type": "human",
                "assignee_field": "investigator",
                "due_field": "target_completion"
            }},
            {"type": "schedule_action", "params": {
                "action_type": "send_reminder",
                "cron": "0 9 * * *",  # Daily at 9am
                "until": "{node.target_completion}"
            }}
        ]
    },

    {
        "id": "cascade_investigation_to_nc",
        "name": "Update NC When Investigation Starts",
        "trigger": {"type": "state_change", "to_states": ["In Progress"]},
        "when": {"node_type": "Investigation"},
        "then": [
            {"type": "transition_state", "params": {
                "target": "{edge.TRIGGERS.from}",  # The NC that triggered this
                "to_state": "Under Investigation"
            }}
        ]
    },

    # === Root Cause Rules ===
    {
        "id": "root_cause_confirmed_needs_capa",
        "name": "Confirmed Root Cause Needs CAPA",
        "trigger": {"type": "state_change", "to_states": ["Confirmed"]},
        "when": {"node_type": "RootCause"},
        "then": [
            {"type": "create_task", "params": {
                "title": "Define CAPA actions for: {node.description}",
                "task_type": "human",
                "assignee": "{edge.IDENTIFIES.from.investigator}",
                "due_delta": "P2D"
            }},
            {"type": "run_agent", "params": {
                "agent": "capa-suggester",
                "instructions": "Based on root cause category '{node.category}', suggest appropriate corrective and preventive actions"
            }}
        ]
    },

    # === CAPA Action Rules ===
    {
        "id": "capa_action_created",
        "name": "CAPA Action Created - Assign and Track",
        "trigger": {"type": "event", "event_types": ["node.created"]},
        "when": {"node_type": "CAPAAction"},
        "then": [
            {"type": "create_task", "params": {
                "title": "Complete: {node.title}",
                "task_type": "human",
                "assignee_field": "assigned_to",
                "due_field": "due_date"
            }},
            {"type": "schedule_action", "params": {
                "action_type": "send_notification",
                "at": "{node.due_date - P1D}",
                "params": {"template": "action_due_tomorrow"}
            }},
            {"type": "schedule_action", "params": {
                "action_type": "transition_state",
                "at": "{node.due_date}",
                "params": {"to_state": "Overdue"},
                "condition": "{node.status} in ['Open', 'In Progress']"
            }}
        ]
    },

    {
        "id": "capa_completed_needs_verification",
        "name": "Completed CAPA Needs Verification",
        "trigger": {"type": "state_change", "to_states": ["Completed"]},
        "when": {"node_type": "CAPAAction"},
        "then": [
            {"type": "create_node", "params": {
                "node_type": "Verification",
                "title_template": "Verify: {source.title}",
                "fields": {"method": "Document Review"}
            }},
            {"type": "create_edge", "params": {
                "edge_type": "VERIFIED_BY",
                "from": "{source.id}",
                "to": "{created_node.id}"
            }},
            {"type": "create_task", "params": {
                "title": "Verify: {source.title}",
                "task_type": "human",
                "assignee": {"type": "group", "id": "qa_specialists"},
                "exclude": "{source.assigned_to}",  # Different person must verify
                "due_delta": "P2D"
            }}
        ]
    },

    # === Verification Rules ===
    {
        "id": "verification_effective_cascade",
        "name": "Effective Verification Updates Chain",
        "trigger": {"type": "state_change", "to_states": ["Complete"]},
        "when": {
            "node_type": "Verification",
            "field_conditions": [{"field": "result", "op": "eq", "value": "Effective"}]
        },
        "then": [
            {"type": "transition_state", "params": {
                "target": "{edge.VERIFIED_BY.from}",  # The CAPAAction
                "to_state": "Verified"
            }},
            {"type": "transition_state", "params": {
                "target": "{edge.VERIFIED_BY.from.edge.ADDRESSES.to}",  # The RootCause
                "to_state": "Addressed"
            }}
        ]
    },

    {
        "id": "all_verified_check_closure",
        "name": "Check NC Closure When All Actions Verified",
        "trigger": {"type": "state_change", "to_states": ["Verified"]},
        "when": {"node_type": "CAPAAction"},
        "then": [
            {"type": "run_agent", "params": {
                "agent": "closure-checker",
                "instructions": "Check if NC can be closed. Verify all CAPAActions are Verified and all RootCauses are Addressed."
            }}
        ]
    },

    # === NC Closure Rules ===
    {
        "id": "nc_closure_approved",
        "name": "NC Closure Finalizes Everything",
        "trigger": {"type": "state_change", "to_states": ["Closed"]},
        "when": {"node_type": "Nonconformance"},
        "then": [
            {"type": "transition_state", "params": {
                "target": "{edge.TRIGGERS.to}",  # Investigation
                "to_state": "Complete"
            }},
            {"type": "run_agent", "params": {
                "agent": "report-generator",
                "instructions": "Generate CAPA closure report including timeline, root causes, actions taken, and verification results"
            }},
            {"type": "send_notification", "params": {
                "to": [
                    "{node.reported_by}",
                    "{edge.TRIGGERS.to.investigator}",
                    {"type": "group", "id": "qa_managers"}
                ],
                "template": "nc_closed"
            }}
        ]
    }
]
```

---

## Agent Definitions

```python
agents = {
    "analysis-agent": {
        "description": "Analyzes data and documents to support investigations",
        "model": "claude-sonnet-4-20250514",
        "tools": ["get_node", "get_connected_nodes", "read_attachment", "update_node"],
        "max_turns": 10,
        "timeout": "PT5M"
    },

    "capa-suggester": {
        "description": "Suggests corrective and preventive actions based on root cause",
        "model": "claude-sonnet-4-20250514",
        "tools": ["get_node", "get_connected_nodes", "create_node_suggestion"],
        "max_turns": 5,
        "timeout": "PT2M"
    },

    "closure-checker": {
        "description": "Verifies all closure requirements are met",
        "model": "claude-haiku-3-5-20241022",
        "tools": ["get_node", "get_connected_nodes", "create_task"],
        "max_turns": 3,
        "timeout": "PT1M"
    },

    "report-generator": {
        "description": "Generates closure reports and summaries",
        "model": "claude-sonnet-4-20250514",
        "tools": ["get_node", "get_connected_nodes", "get_execution_history", "create_attachment"],
        "max_turns": 10,
        "timeout": "PT5M"
    }
}
```

---

## Metrics Dashboard

After running this workflow, the dashboard would show:

```
╔══════════════════════════════════════════════════════════════════╗
║                    CAPA Workflow - NC-2024-0142                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Status: CLOSED                        Duration: 7 days          ║
║  Severity: Critical                    Target: 30 days ✓         ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  EXECUTION SUMMARY                                               ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Tasks                          Transitions                      ║
║  ├─ Human: 8 completed          ├─ Manual: 4                     ║
║  ├─ Agent: 1 completed          ├─ Automatic: 7                  ║
║  └─ Failed: 0                   └─ Blocked: 0                    ║
║                                                                  ║
║  Timers                         Notifications                    ║
║  ├─ Set: 4                      ├─ Sent: 12                      ║
║  ├─ Fired: 1 (reminder)         └─ Templates: 5                  ║
║  └─ Cancelled: 3 (completed)                                     ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  LLM USAGE                                                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Agent Runs: 4                  Total Tokens: 45,200             ║
║  ├─ analysis-agent: 12,450      Estimated Cost: $0.85            ║
║  ├─ capa-suggester: 8,300                                        ║
║  ├─ closure-checker: 2,100                                       ║
║  └─ report-generator: 22,350                                     ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  TIMELINE                                                        ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Day 0 ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━● Day 7 ║
║        │                                                  │      ║
║        NC Created                                    NC Closed   ║
║            │                                              │      ║
║            ├─ Investigation Assigned (Day 0)              │      ║
║            ├─ Agent Analysis (Day 2)                      │      ║
║            ├─ Root Cause Confirmed (Day 2)                │      ║
║            ├─ CAPA Actions Created (Day 3)                │      ║
║            ├─ Actions Completed (Day 4)                   │      ║
║            └─ Verification Complete (Day 6)               │      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Key Benefits Demonstrated

| Aspect | Without Engine | With Engine |
|--------|---------------|-------------|
| **State Transitions** | 11 manual clicks | 4 manual, 7 automatic |
| **Task Management** | Spreadsheet/email | Built-in queue with SLAs |
| **Notifications** | Manual emails | Automatic, template-based |
| **Agent Assistance** | Copy/paste to ChatGPT | Integrated with context |
| **Compliance** | Hope rules are followed | Rules enforced automatically |
| **Audit Trail** | Manually documented | Automatic, complete |
| **Time to Close** | 2-4 weeks typical | 7 days (77% faster) |
| **Cost Visibility** | Unknown | $0.85 tracked |

---

## Conclusion

This example demonstrates how the Execution Engine transforms the CAPA workflow from a manual, error-prone process into an automated, compliant, and efficient system. The key enablers are:

1. **Automatic cascading**: State changes ripple through the graph appropriately
2. **Task orchestration**: Work is assigned, tracked, and escalated automatically
3. **Agent integration**: AI assists with analysis and suggestions
4. **Timer management**: SLAs are enforced without manual tracking
5. **Complete observability**: Every action is logged with full context

The same patterns apply to any workflow template in the system - document approval, equipment maintenance, ML lifecycle management, etc.
