#!/usr/bin/env python3
"""
Seed script for Sales Prospecting Workflow.

Based on the sales process:
1. Sales Trigger Detection (RFP, funding, hiring)
2. ICP Fit Validation (firmographics)
3. Salesforce Lookup (existing vs new accounts)
4. Contact Enrichment (Apollo integration)
5. Buyer Persona Mapping
6. Human Review (HITL)
7. Outreach
8. Lead/Account Qualification
9. Content Selection

Run with: uv run python scripts/seed_sales_workflow.py
"""

import asyncio
import os
import sys

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import close_database, init_database
from app.db.graph_store import GraphStore
from app.models import NodeCreate, WorkflowDefinition
from app.models.task import (
    CompoundDelta,
    CompoundDeltaStep,
    CreateEdgeDelta,
    CreateNodeDelta,
    NodeReference,
    TaskDefinition,
    TaskSetDefinitionCreate,
    TaskSetInstanceCreate,
    UpdateNodeStatusDelta,
)
from app.models.workflow import EdgeType, Field, FieldKind, NodeState, NodeType, UIHints

WORKFLOW_NAME = "Sales Prospecting Workflow"


async def main():
    """Seed the database with sales workflow data."""
    db_path = os.getenv("DATABASE_PATH", "./data/workflow.db")
    print(f"Using database: {db_path}")

    await init_database(db_path)
    graph_store = GraphStore()

    # Delete existing workflow if it exists
    existing = await graph_store.list_workflows()
    for w in existing:
        if w.name == WORKFLOW_NAME:
            print(f"Deleting existing workflow: {w.id}")
            await graph_store.delete_workflow(w.id)
            print("Deleted.")

    print("Creating workflow definition...")

    # ==========================================================================
    # WORKFLOW DEFINITION
    # ==========================================================================

    workflow_def = WorkflowDefinition(
        workflow_id="sales-prospecting",
        name=WORKFLOW_NAME,
        description=(
            "End-to-end sales prospecting workflow from trigger detection "
            "to qualified opportunity"
        ),
        node_types=[
            # -----------------------------------------------------------------
            # SALES TRIGGER
            # -----------------------------------------------------------------
            NodeType(
                type="SalesTrigger",
                display_name="Sales Trigger",
                title_field="title",
                subtitle_field="triggerType",
                fields=[
                    Field(key="title", label="Title", kind=FieldKind.STRING, required=True),
                    Field(
                        key="triggerType",
                        label="Trigger Type",
                        kind=FieldKind.ENUM,
                        required=True,
                        values=[
                            "RFP Announced",
                            "Project Announced",
                            "Funding Round",
                            "Hiring Surge",
                            "Leadership Change",
                            "Expansion News",
                            "Technology Adoption",
                        ],
                    ),
                    Field(key="source", label="Source", kind=FieldKind.STRING),
                    Field(key="sourceUrl", label="Source URL", kind=FieldKind.STRING),
                    Field(key="detectedDate", label="Detected Date", kind=FieldKind.DATETIME),
                    Field(key="description", label="Description", kind=FieldKind.STRING),
                    Field(
                        key="urgency",
                        label="Urgency",
                        kind=FieldKind.ENUM,
                        values=["Low", "Medium", "High", "Critical"],
                    ),
                    Field(key="notes", label="Notes", kind=FieldKind.STRING),
                ],
                states=NodeState(
                    enabled=True,
                    initial="Detected",
                    values=["Detected", "Validated", "Actioned", "Expired", "Invalid"],
                    transitions=[
                        {"from": "Detected", "to": "Validated"},
                        {"from": "Detected", "to": "Invalid"},
                        {"from": "Validated", "to": "Actioned"},
                        {"from": "Validated", "to": "Expired"},
                    ],
                ),
                ui=UIHints(
                    default_views=["kanban", "list"],
                    primary_sections=["properties"],
                    list_columns=["title", "triggerType", "urgency"],
                    quick_actions=[],
                ),
            ),
            # -----------------------------------------------------------------
            # ACCOUNT
            # -----------------------------------------------------------------
            NodeType(
                type="Account",
                display_name="Account",
                title_field="companyName",
                subtitle_field="industry",
                fields=[
                    Field(
                        key="companyName",
                        label="Company Name",
                        kind=FieldKind.STRING,
                        required=True,
                    ),
                    Field(
                        key="industry",
                        label="Industry",
                        kind=FieldKind.ENUM,
                        values=[
                            "Technology",
                            "Financial Services",
                            "Healthcare",
                            "Manufacturing",
                            "Retail",
                            "Professional Services",
                            "Energy",
                            "Other",
                        ],
                    ),
                    Field(
                        key="companySize",
                        label="Company Size",
                        kind=FieldKind.ENUM,
                        values=["1-50", "51-200", "201-1000", "1001-5000", "5000+"],
                    ),
                    Field(key="annualRevenue", label="Annual Revenue ($M)", kind=FieldKind.NUMBER),
                    Field(key="headquarters", label="Headquarters", kind=FieldKind.STRING),
                    Field(key="website", label="Website", kind=FieldKind.STRING),
                    Field(key="linkedInUrl", label="LinkedIn URL", kind=FieldKind.STRING),
                    Field(key="salesforceId", label="Salesforce ID", kind=FieldKind.STRING),
                    Field(key="apolloId", label="Apollo ID", kind=FieldKind.STRING),
                    Field(
                        key="icpScore",
                        label="ICP Score",
                        kind=FieldKind.NUMBER,
                    ),
                    Field(
                        key="icpFitReason",
                        label="ICP Fit Reason",
                        kind=FieldKind.STRING,
                    ),
                    Field(
                        key="existsInSalesforce",
                        label="Exists in Salesforce",
                        kind=FieldKind.ENUM,
                        values=["Yes", "No", "Unknown"],
                    ),
                    Field(key="ownerName", label="Account Owner", kind=FieldKind.PERSON),
                    Field(key="tags", label="Tags", kind=FieldKind.TAG_ARRAY),
                ],
                states=NodeState(
                    enabled=True,
                    initial="New",
                    values=[
                        "New",
                        "ICP Validated",
                        "Enriched",
                        "In Review",
                        "Qualified",
                        "Disqualified",
                        "Active Opportunity",
                    ],
                    transitions=[
                        {"from": "New", "to": "ICP Validated"},
                        {"from": "New", "to": "Disqualified"},
                        {"from": "ICP Validated", "to": "Enriched"},
                        {"from": "ICP Validated", "to": "Disqualified"},
                        {"from": "Enriched", "to": "In Review"},
                        {"from": "In Review", "to": "Qualified"},
                        {"from": "In Review", "to": "Disqualified"},
                        {"from": "Qualified", "to": "Active Opportunity"},
                    ],
                ),
                ui=UIHints(
                    default_views=["kanban", "list", "graph"],
                    primary_sections=["properties", "connections"],
                    list_columns=["companyName", "industry", "companySize", "icpScore"],
                    quick_actions=[
                        {
                            "type": "create",
                            "label": "Add Contact",
                            "targetNodeType": "Contact",
                            "edgeType": "WORKS_AT",
                            "direction": "incoming",
                        }
                    ],
                ),
            ),
            # -----------------------------------------------------------------
            # CONTACT / LEAD
            # -----------------------------------------------------------------
            NodeType(
                type="Contact",
                display_name="Contact",
                title_field="fullName",
                subtitle_field="jobTitle",
                fields=[
                    Field(
                        key="fullName", label="Full Name", kind=FieldKind.STRING, required=True
                    ),
                    Field(key="firstName", label="First Name", kind=FieldKind.STRING),
                    Field(key="lastName", label="Last Name", kind=FieldKind.STRING),
                    Field(key="email", label="Email", kind=FieldKind.STRING),
                    Field(key="phone", label="Phone", kind=FieldKind.STRING),
                    Field(key="jobTitle", label="Job Title", kind=FieldKind.STRING),
                    Field(key="department", label="Department", kind=FieldKind.STRING),
                    Field(key="linkedInUrl", label="LinkedIn URL", kind=FieldKind.STRING),
                    Field(key="salesforceId", label="Salesforce ID", kind=FieldKind.STRING),
                    Field(key="apolloId", label="Apollo ID", kind=FieldKind.STRING),
                    Field(
                        key="buyerPersona",
                        label="Buyer Persona",
                        kind=FieldKind.ENUM,
                        values=[
                            "Economic Buyer",
                            "Technical Buyer",
                            "User Buyer",
                            "Champion",
                            "Influencer",
                            "Gatekeeper",
                        ],
                    ),
                    Field(
                        key="buyerStage",
                        label="Buyer Stage",
                        kind=FieldKind.ENUM,
                        values=[
                            "Unaware",
                            "Problem Aware",
                            "Solution Aware",
                            "Product Aware",
                            "Most Aware",
                        ],
                    ),
                    Field(
                        key="engagementScore",
                        label="Engagement Score",
                        kind=FieldKind.NUMBER,
                    ),
                    Field(key="lastContactDate", label="Last Contact", kind=FieldKind.DATETIME),
                    Field(key="notes", label="Notes", kind=FieldKind.STRING),
                ],
                states=NodeState(
                    enabled=True,
                    initial="Identified",
                    values=[
                        "Identified",
                        "Enriched",
                        "Persona Mapped",
                        "Ready for Outreach",
                        "Contacted",
                        "Engaged",
                        "Qualified",
                        "Disqualified",
                    ],
                    transitions=[
                        {"from": "Identified", "to": "Enriched"},
                        {"from": "Enriched", "to": "Persona Mapped"},
                        {"from": "Persona Mapped", "to": "Ready for Outreach"},
                        {"from": "Ready for Outreach", "to": "Contacted"},
                        {"from": "Contacted", "to": "Engaged"},
                        {"from": "Contacted", "to": "Disqualified"},
                        {"from": "Engaged", "to": "Qualified"},
                        {"from": "Engaged", "to": "Disqualified"},
                    ],
                ),
                ui=UIHints(
                    default_views=["list", "kanban"],
                    primary_sections=["properties"],
                    list_columns=["fullName", "jobTitle", "buyerPersona", "buyerStage"],
                    quick_actions=[],
                ),
            ),
            # -----------------------------------------------------------------
            # OUTREACH
            # -----------------------------------------------------------------
            NodeType(
                type="Outreach",
                display_name="Outreach",
                title_field="subject",
                subtitle_field="channel",
                fields=[
                    Field(key="subject", label="Subject", kind=FieldKind.STRING, required=True),
                    Field(
                        key="channel",
                        label="Channel",
                        kind=FieldKind.ENUM,
                        required=True,
                        values=["Email", "LinkedIn", "Phone", "Meeting"],
                    ),
                    Field(key="messageBody", label="Message Body", kind=FieldKind.STRING),
                    Field(key="scheduledDate", label="Scheduled Date", kind=FieldKind.DATETIME),
                    Field(key="sentDate", label="Sent Date", kind=FieldKind.DATETIME),
                    Field(
                        key="outcome",
                        label="Outcome",
                        kind=FieldKind.ENUM,
                        values=[
                            "No Response",
                            "Positive Response",
                            "Negative Response",
                            "Meeting Booked",
                            "Bounced",
                        ],
                    ),
                    Field(key="senderName", label="Sender", kind=FieldKind.PERSON),
                    Field(key="notes", label="Notes", kind=FieldKind.STRING),
                ],
                states=NodeState(
                    enabled=True,
                    initial="Draft",
                    values=["Draft", "Scheduled", "Sent", "Responded", "Closed"],
                    transitions=[
                        {"from": "Draft", "to": "Scheduled"},
                        {"from": "Scheduled", "to": "Sent"},
                        {"from": "Sent", "to": "Responded"},
                        {"from": "Sent", "to": "Closed"},
                        {"from": "Responded", "to": "Closed"},
                    ],
                ),
            ),
            # -----------------------------------------------------------------
            # CONTENT
            # -----------------------------------------------------------------
            NodeType(
                type="SalesContent",
                display_name="Sales Content",
                title_field="title",
                subtitle_field="contentType",
                fields=[
                    Field(key="title", label="Title", kind=FieldKind.STRING, required=True),
                    Field(
                        key="contentType",
                        label="Content Type",
                        kind=FieldKind.ENUM,
                        values=[
                            "Case Study",
                            "White Paper",
                            "Product Sheet",
                            "Demo Video",
                            "ROI Calculator",
                            "Competitive Analysis",
                            "Email Template",
                        ],
                    ),
                    Field(
                        key="targetPersona",
                        label="Target Persona",
                        kind=FieldKind.ENUM,
                        values=[
                            "Economic Buyer",
                            "Technical Buyer",
                            "User Buyer",
                            "Champion",
                            "Influencer",
                        ],
                    ),
                    Field(
                        key="targetStage",
                        label="Target Stage",
                        kind=FieldKind.ENUM,
                        values=[
                            "Problem Aware",
                            "Solution Aware",
                            "Product Aware",
                            "Most Aware",
                        ],
                    ),
                    Field(key="url", label="URL", kind=FieldKind.STRING),
                    Field(key="description", label="Description", kind=FieldKind.STRING),
                    Field(key="tags", label="Tags", kind=FieldKind.TAG_ARRAY),
                ],
            ),
        ],
        edge_types=[
            EdgeType(
                type="TRIGGERED_FOR",
                display_name="Triggered For",
                from_type="SalesTrigger",
                to_type="Account",
            ),
            EdgeType(
                type="WORKS_AT",
                display_name="Works At",
                from_type="Contact",
                to_type="Account",
            ),
            EdgeType(
                type="OUTREACH_TO",
                display_name="Outreach To",
                from_type="Outreach",
                to_type="Contact",
            ),
            EdgeType(
                type="USES_CONTENT",
                display_name="Uses Content",
                from_type="Outreach",
                to_type="SalesContent",
            ),
            EdgeType(
                type="RELATED_TRIGGER",
                display_name="Related Trigger",
                from_type="Contact",
                to_type="SalesTrigger",
            ),
        ],
    )

    workflow_summary = await graph_store.create_workflow(workflow_def)
    workflow_id = workflow_summary.id
    print(f"Created workflow: {workflow_summary.name} (ID: {workflow_id})")

    # ==========================================================================
    # TASKSET 1: TRIGGER-TO-OUTREACH FLOW (Global/Workflow-scoped)
    # ==========================================================================

    print("\nCreating TaskSet: Trigger-to-Outreach Flow...")

    trigger_flow_tasks = TaskSetDefinitionCreate(
        name="Trigger-to-Outreach Flow",
        description="Complete flow from sales trigger detection to qualified outreach",
        tasks=[
            # Step 1: Create/Capture the Sales Trigger
            TaskDefinition(
                id="capture-trigger",
                name="Capture Sales Trigger",
                description="Record the sales trigger event (RFP, funding, hiring surge, etc.)",
                delta=CreateNodeDelta(
                    node_type="SalesTrigger",
                    initial_status="Detected",
                    initial_values={
                        "urgency": "Medium",
                    },
                ),
                output_node_key="trigger",
            ),
            # Step 2: Validate the trigger
            TaskDefinition(
                id="validate-trigger",
                name="Validate Trigger",
                description="Confirm the trigger is legitimate and actionable",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("capture-trigger"),
                    from_status="Detected",
                    to_status="Validated",
                ),
                depends_on=["capture-trigger"],
            ),
            # Step 3: Create/Identify the Account
            TaskDefinition(
                id="create-account",
                name="Create/Find Account",
                description="Create the account or find existing in Salesforce",
                delta=CreateNodeDelta(
                    node_type="Account",
                    initial_status="New",
                    initial_values={
                        "existsInSalesforce": "Unknown",
                    },
                ),
                depends_on=["validate-trigger"],
                output_node_key="account",
            ),
            # Step 4: Link trigger to account
            TaskDefinition(
                id="link-trigger-account",
                name="Link Trigger to Account",
                description="Associate the sales trigger with the target account",
                delta=CreateEdgeDelta(
                    edge_type="TRIGGERED_FOR",
                    from_node=NodeReference.by_task_output("capture-trigger"),
                    to_node=NodeReference.by_task_output("create-account"),
                ),
                depends_on=["create-account"],
            ),
            # Step 5: Validate ICP Fit
            TaskDefinition(
                id="validate-icp",
                name="Validate ICP Fit",
                description=(
                    "Confirm account meets ICP criteria "
                    "(industry, size, revenue, geography)"
                ),
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("create-account"),
                    from_status="New",
                    to_status="ICP Validated",
                ),
                depends_on=["link-trigger-account"],
            ),
            # Step 6: Enrich Account Data
            TaskDefinition(
                id="enrich-account",
                name="Enrich Account Data",
                description="Pull additional data from Apollo or similar platform",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("create-account"),
                    from_status="ICP Validated",
                    to_status="Enriched",
                ),
                depends_on=["validate-icp"],
            ),
            # Step 7: Identify Key Contact
            TaskDefinition(
                id="identify-contact",
                name="Identify Key Contact",
                description="Find or add the primary contact from the trigger or Apollo lookup",
                delta=CreateNodeDelta(
                    node_type="Contact",
                    initial_status="Identified",
                ),
                depends_on=["enrich-account"],
                output_node_key="contact",
            ),
            # Step 8: Link contact to account
            TaskDefinition(
                id="link-contact-account",
                name="Link Contact to Account",
                description="Associate the contact with their company",
                delta=CreateEdgeDelta(
                    edge_type="WORKS_AT",
                    from_node=NodeReference.by_task_output("identify-contact"),
                    to_node=NodeReference.by_task_output("create-account"),
                ),
                depends_on=["identify-contact"],
            ),
            # Step 9: Enrich Contact
            TaskDefinition(
                id="enrich-contact",
                name="Enrich Contact Data",
                description="Pull contact details from Apollo (email, phone, LinkedIn)",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("identify-contact"),
                    from_status="Identified",
                    to_status="Enriched",
                ),
                depends_on=["link-contact-account"],
            ),
            # Step 10: Map Buyer Persona
            TaskDefinition(
                id="map-persona",
                name="Map Buyer Persona",
                description="Determine the contact's buyer persona and stage",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("identify-contact"),
                    from_status="Enriched",
                    to_status="Persona Mapped",
                ),
                depends_on=["enrich-contact"],
            ),
            # Step 11: Human Review (HITL)
            TaskDefinition(
                id="human-review",
                name="Human Review",
                description="Manual review and confirmation of lead quality",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("create-account"),
                    from_status="Enriched",
                    to_status="In Review",
                ),
                depends_on=["map-persona"],
            ),
            # Step 12: Qualify Account
            TaskDefinition(
                id="qualify-account",
                name="Qualify Account",
                description="Mark account as qualified after human review",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("create-account"),
                    from_status="In Review",
                    to_status="Qualified",
                ),
                depends_on=["human-review"],
            ),
            # Step 13: Mark Contact Ready for Outreach
            TaskDefinition(
                id="ready-for-outreach",
                name="Mark Ready for Outreach",
                description="Contact is ready to be engaged",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("identify-contact"),
                    from_status="Persona Mapped",
                    to_status="Ready for Outreach",
                ),
                depends_on=["qualify-account"],
            ),
            # Step 14: Create Outreach
            TaskDefinition(
                id="create-outreach",
                name="Draft Outreach",
                description="Create personalized outreach based on trigger, persona, and stage",
                delta=CreateNodeDelta(
                    node_type="Outreach",
                    initial_status="Draft",
                    initial_values={
                        "channel": "Email",
                    },
                ),
                depends_on=["ready-for-outreach"],
                output_node_key="outreach",
            ),
            # Step 15: Link outreach to contact
            TaskDefinition(
                id="link-outreach-contact",
                name="Link Outreach to Contact",
                description="Associate the outreach with the target contact",
                delta=CreateEdgeDelta(
                    edge_type="OUTREACH_TO",
                    from_node=NodeReference.by_task_output("create-outreach"),
                    to_node=NodeReference.by_task_output("identify-contact"),
                ),
                depends_on=["create-outreach"],
            ),
            # Step 16: Mark trigger as actioned
            TaskDefinition(
                id="mark-trigger-actioned",
                name="Mark Trigger Actioned",
                description="The sales trigger has been fully processed",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_task_output("capture-trigger"),
                    from_status="Validated",
                    to_status="Actioned",
                ),
                depends_on=["link-outreach-contact"],
            ),
        ],
        tags=["sales", "prospecting", "full-flow"],
    )

    trigger_flow_def = await graph_store.create_task_set_definition(
        workflow_id, trigger_flow_tasks
    )
    print(f"Created TaskSet: {trigger_flow_def.name} (ID: {trigger_flow_def.id})")

    # ==========================================================================
    # TASKSET 2: ACCOUNT QUALIFICATION (Node-scoped to Account)
    # ==========================================================================

    print("\nCreating TaskSet: Account Qualification Flow...")

    # Using CompoundDelta to bundle "create contact + link to account" operations
    # Instead of 6 granular tasks, we now have 4 semantically meaningful tasks
    account_qual_tasks = TaskSetDefinitionCreate(
        name="Account Qualification",
        description="Qualify an existing account through the sales process",
        root_node_type="Account",
        tasks=[
            # Task 1: Review Account (simple, stays as single delta)
            TaskDefinition(
                id="review-account-data",
                name="Review Account Data",
                description="Review firmographic data and ICP fit score",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_query("Account"),
                    from_status=["New", "ICP Validated"],
                    to_status="In Review",
                ),
            ),
            # Task 2: Add Primary Contact (compound: create + link)
            TaskDefinition(
                id="add-primary-contact",
                name="Add Primary Contact",
                description="Identify and add the primary decision maker to account",
                delta=CompoundDelta(
                    steps=[
                        CompoundDeltaStep(
                            key="contact",
                            label="Create Contact",
                            delta=CreateNodeDelta(
                                node_type="Contact",
                                initial_status="Identified",
                                initial_values={
                                    "buyerPersona": "Economic Buyer",
                                },
                            ),
                        ),
                        CompoundDeltaStep(
                            key="link",
                            label="Link to Account",
                            delta=CreateEdgeDelta(
                                edge_type="WORKS_AT",
                                from_node=NodeReference.by_step_output("contact"),
                                to_node=NodeReference.by_query("Account"),
                            ),
                        ),
                    ],
                    output_step_key="contact",
                ),
                depends_on=["review-account-data"],
                output_node_key="primary_contact",
            ),
            # Task 3: Add Champion Contact (compound: create + link)
            TaskDefinition(
                id="add-champion",
                name="Add Champion Contact",
                description="Identify and add an internal champion to account",
                delta=CompoundDelta(
                    steps=[
                        CompoundDeltaStep(
                            key="contact",
                            label="Create Champion",
                            delta=CreateNodeDelta(
                                node_type="Contact",
                                initial_status="Identified",
                                initial_values={
                                    "buyerPersona": "Champion",
                                },
                            ),
                        ),
                        CompoundDeltaStep(
                            key="link",
                            label="Link to Account",
                            delta=CreateEdgeDelta(
                                edge_type="WORKS_AT",
                                from_node=NodeReference.by_step_output("contact"),
                                to_node=NodeReference.by_query("Account"),
                            ),
                        ),
                    ],
                    output_step_key="contact",
                ),
                depends_on=["add-primary-contact"],
                output_node_key="champion",
            ),
            # Task 4: Qualify Account (simple, stays as single delta)
            TaskDefinition(
                id="qualify-account-decision",
                name="Qualify Account",
                description="Make final qualification decision",
                delta=UpdateNodeStatusDelta(
                    target_node=NodeReference.by_query("Account"),
                    from_status="In Review",
                    to_status="Qualified",
                ),
                depends_on=["add-champion"],
            ),
        ],
        tags=["sales", "qualification", "account", "compound-demo"],
    )

    account_qual_def = await graph_store.create_task_set_definition(
        workflow_id, account_qual_tasks
    )
    print(f"Created TaskSet: {account_qual_def.name} (ID: {account_qual_def.id})")

    # ==========================================================================
    # TASKSET 3: CONTACT OUTREACH (Node-scoped to Contact)
    # ==========================================================================

    print("\nCreating TaskSet: Contact Outreach Flow...")

    # Using CompoundDelta to bundle related operations into single logical tasks
    # Instead of 8 granular tasks, we now have 3 semantically meaningful tasks
    contact_outreach_tasks = TaskSetDefinitionCreate(
        name="Contact Outreach Sequence",
        description="Multi-touch outreach sequence for a qualified contact",
        root_node_type="Contact",
        tasks=[
            # Task 1: Select content (simple, stays as single delta)
            TaskDefinition(
                id="select-content",
                name="Select Relevant Content",
                description="Choose content based on persona and stage",
                delta=CreateNodeDelta(
                    node_type="SalesContent",
                    initial_values={
                        "contentType": "Case Study",
                    },
                ),
                output_node_key="content",
            ),
            # Task 2: Draft and Send Initial Email (compound: 5 operations bundled)
            # Creates email, links to contact, attaches content, sends, updates contact
            TaskDefinition(
                id="draft-and-send-email",
                name="Draft and Send Initial Email",
                description=(
                    "Create personalized first touch email with content, "
                    "send it, and update contact status"
                ),
                delta=CompoundDelta(
                    steps=[
                        CompoundDeltaStep(
                            key="email",
                            label="Create Email",
                            delta=CreateNodeDelta(
                                node_type="Outreach",
                                initial_status="Draft",
                                initial_values={
                                    "channel": "Email",
                                    "subject": "Quick question",
                                },
                            ),
                        ),
                        CompoundDeltaStep(
                            key="link-to-contact",
                            label="Link to Contact",
                            delta=CreateEdgeDelta(
                                edge_type="OUTREACH_TO",
                                from_node=NodeReference.by_step_output("email"),
                                to_node=NodeReference.by_query("Contact"),
                            ),
                        ),
                        CompoundDeltaStep(
                            key="attach-content",
                            label="Attach Content",
                            delta=CreateEdgeDelta(
                                edge_type="USES_CONTENT",
                                from_node=NodeReference.by_step_output("email"),
                                to_node=NodeReference.by_task_output("select-content"),
                            ),
                        ),
                        CompoundDeltaStep(
                            key="send",
                            label="Mark as Sent",
                            delta=UpdateNodeStatusDelta(
                                target_node=NodeReference.by_step_output("email"),
                                from_status="Draft",
                                to_status="Sent",
                            ),
                        ),
                        CompoundDeltaStep(
                            key="update-contact",
                            label="Update Contact Status",
                            delta=UpdateNodeStatusDelta(
                                target_node=NodeReference.by_query("Contact"),
                                from_status="Ready for Outreach",
                                to_status="Contacted",
                            ),
                        ),
                    ],
                    output_step_key="email",
                ),
                depends_on=["select-content"],
                output_node_key="initial_email",
            ),
            # Task 3: Draft LinkedIn Follow-up (compound: 2 operations bundled)
            # Creates LinkedIn message and links to contact
            TaskDefinition(
                id="draft-linkedin-followup",
                name="Draft LinkedIn Follow-up",
                description="Create follow-up LinkedIn message linked to contact",
                delta=CompoundDelta(
                    steps=[
                        CompoundDeltaStep(
                            key="linkedin",
                            label="Create LinkedIn Message",
                            delta=CreateNodeDelta(
                                node_type="Outreach",
                                initial_status="Draft",
                                initial_values={
                                    "channel": "LinkedIn",
                                    "subject": "Following up",
                                },
                            ),
                        ),
                        CompoundDeltaStep(
                            key="link-to-contact",
                            label="Link to Contact",
                            delta=CreateEdgeDelta(
                                edge_type="OUTREACH_TO",
                                from_node=NodeReference.by_step_output("linkedin"),
                                to_node=NodeReference.by_query("Contact"),
                            ),
                        ),
                    ],
                    output_step_key="linkedin",
                ),
                depends_on=["draft-and-send-email"],
                output_node_key="linkedin_msg",
            ),
        ],
        tags=["sales", "outreach", "sequence", "compound-demo"],
    )

    contact_outreach_def = await graph_store.create_task_set_definition(
        workflow_id, contact_outreach_tasks
    )
    print(f"Created TaskSet: {contact_outreach_def.name} (ID: {contact_outreach_def.id})")

    # ==========================================================================
    # SEED DATA: Sample Accounts, Contacts, and Triggers
    # ==========================================================================

    print("\nCreating sample data...")

    # Create sample accounts
    accounts = [
        {
            "companyName": "Acme Technologies",
            "industry": "Technology",
            "companySize": "201-1000",
            "annualRevenue": 75,
            "headquarters": "San Francisco, CA",
            "website": "https://acme.tech",
            "icpScore": 85,
            "icpFitReason": "Strong fit - tech company in target size range",
            "existsInSalesforce": "Yes",
            "tags": ["enterprise", "tech"],
        },
        {
            "companyName": "GlobalBank Financial",
            "industry": "Financial Services",
            "companySize": "5000+",
            "annualRevenue": 500,
            "headquarters": "New York, NY",
            "website": "https://globalbank.com",
            "icpScore": 72,
            "icpFitReason": "Good fit - financial services, larger than ideal",
            "existsInSalesforce": "No",
            "tags": ["enterprise", "finance"],
        },
        {
            "companyName": "HealthFirst Solutions",
            "industry": "Healthcare",
            "companySize": "51-200",
            "annualRevenue": 25,
            "headquarters": "Boston, MA",
            "website": "https://healthfirst.io",
            "icpScore": 90,
            "icpFitReason": "Excellent fit - healthcare tech in sweet spot",
            "existsInSalesforce": "No",
            "tags": ["mid-market", "healthcare"],
        },
    ]

    account_nodes = []
    for acc_data in accounts:
        acc = await graph_store.create_node(
            workflow_id,
            NodeCreate(
                type="Account",
                title=acc_data["companyName"],
                status="New",
                properties=acc_data,
            ),
        )
        account_nodes.append(acc)
        print(f"  Created Account: {acc.title}")

    # Create sample contacts
    contacts = [
        {
            "fullName": "Sarah Chen",
            "firstName": "Sarah",
            "lastName": "Chen",
            "email": "sarah.chen@acme.tech",
            "jobTitle": "VP of Engineering",
            "department": "Engineering",
            "buyerPersona": "Technical Buyer",
            "buyerStage": "Problem Aware",
            "account_idx": 0,
        },
        {
            "fullName": "Michael Rodriguez",
            "firstName": "Michael",
            "lastName": "Rodriguez",
            "email": "m.rodriguez@globalbank.com",
            "jobTitle": "Chief Technology Officer",
            "department": "Technology",
            "buyerPersona": "Economic Buyer",
            "buyerStage": "Solution Aware",
            "account_idx": 1,
        },
        {
            "fullName": "Emily Watson",
            "firstName": "Emily",
            "lastName": "Watson",
            "email": "emily@healthfirst.io",
            "jobTitle": "Director of Operations",
            "department": "Operations",
            "buyerPersona": "Champion",
            "buyerStage": "Product Aware",
            "account_idx": 2,
        },
    ]

    contact_nodes = []
    for contact_data in contacts:
        account_idx = contact_data.pop("account_idx")
        contact = await graph_store.create_node(
            workflow_id,
            NodeCreate(
                type="Contact",
                title=contact_data["fullName"],
                status="Ready for Outreach",
                properties=contact_data,
            ),
        )
        contact_nodes.append(contact)
        print(f"  Created Contact: {contact.title}")

        # Link to account
        from app.models.edge import EdgeCreate

        await graph_store.create_edge(
            workflow_id,
            EdgeCreate(
                type="WORKS_AT",
                from_node_id=contact.id,
                to_node_id=account_nodes[account_idx].id,
            ),
        )

    # Create sample triggers
    triggers = [
        {
            "title": "Acme Technologies Series C Funding",
            "triggerType": "Funding Round",
            "source": "TechCrunch",
            "description": "Acme raised $50M Series C, expanding AI capabilities",
            "urgency": "High",
            "account_idx": 0,
        },
        {
            "title": "GlobalBank RFP for Digital Transformation",
            "triggerType": "RFP Announced",
            "source": "Internal Lead",
            "description": "RFP issued for enterprise workflow automation platform",
            "urgency": "Critical",
            "account_idx": 1,
        },
        {
            "title": "HealthFirst Hiring 10+ Engineers",
            "triggerType": "Hiring Surge",
            "source": "LinkedIn",
            "description": "Multiple engineering roles posted, indicating growth",
            "urgency": "Medium",
            "account_idx": 2,
        },
    ]

    for trigger_data in triggers:
        account_idx = trigger_data.pop("account_idx")
        trigger = await graph_store.create_node(
            workflow_id,
            NodeCreate(
                type="SalesTrigger",
                title=trigger_data["title"],
                status="Validated",
                properties=trigger_data,
            ),
        )
        print(f"  Created Trigger: {trigger.title}")

        # Link to account
        await graph_store.create_edge(
            workflow_id,
            EdgeCreate(
                type="TRIGGERED_FOR",
                from_node_id=trigger.id,
                to_node_id=account_nodes[account_idx].id,
            ),
        )

    # Create sample sales content
    content_items = [
        {
            "title": "Enterprise Workflow Automation Case Study",
            "contentType": "Case Study",
            "targetPersona": "Economic Buyer",
            "targetStage": "Solution Aware",
            "description": "How Fortune 500 reduced manual processes by 70%",
            "tags": ["enterprise", "automation"],
        },
        {
            "title": "Technical Architecture Deep Dive",
            "contentType": "White Paper",
            "targetPersona": "Technical Buyer",
            "targetStage": "Product Aware",
            "description": "Security, scalability, and integration capabilities",
            "tags": ["technical", "security"],
        },
        {
            "title": "ROI Calculator - Workflow Automation",
            "contentType": "ROI Calculator",
            "targetPersona": "Economic Buyer",
            "targetStage": "Most Aware",
            "description": "Calculate potential savings from automation",
            "tags": ["roi", "sales-tool"],
        },
    ]

    for content_data in content_items:
        content = await graph_store.create_node(
            workflow_id,
            NodeCreate(
                type="SalesContent",
                title=content_data["title"],
                properties=content_data,
            ),
        )
        print(f"  Created Content: {content.title}")

    # ==========================================================================
    # CREATE TASKSET INSTANCES
    # ==========================================================================

    print("\nCreating TaskSet instances...")

    from app.services.task_progress import TaskProgressService

    progress_service = TaskProgressService(graph_store, workflow_id)

    # Global instance for full trigger-to-outreach flow
    global_instance = await graph_store.create_task_set_instance(
        workflow_id,
        TaskSetInstanceCreate(task_set_definition_id=trigger_flow_def.id),
    )
    global_instance = await progress_service.refresh_task_progress(
        global_instance, trigger_flow_def
    )
    print(f"  Global flow instance: {global_instance.id}")
    print(f"    Available tasks: {global_instance.available_tasks}")

    # Node-scoped instances for account qualification
    for acc in account_nodes[:2]:  # First two accounts
        instance = await graph_store.create_task_set_instance(
            workflow_id,
            TaskSetInstanceCreate(
                task_set_definition_id=account_qual_def.id,
                root_node_id=acc.id,
            ),
        )
        instance = await progress_service.refresh_task_progress(instance, account_qual_def)
        print(f"  Account qualification for '{acc.title}': {instance.id}")
        print(f"    Available tasks: {instance.available_tasks}")

    # Node-scoped instances for contact outreach
    for contact in contact_nodes[:2]:  # First two contacts
        instance = await graph_store.create_task_set_instance(
            workflow_id,
            TaskSetInstanceCreate(
                task_set_definition_id=contact_outreach_def.id,
                root_node_id=contact.id,
            ),
        )
        instance = await progress_service.refresh_task_progress(
            instance, contact_outreach_def
        )
        print(f"  Outreach sequence for '{contact.title}': {instance.id}")
        print(f"    Available tasks: {instance.available_tasks}")

    # ==========================================================================
    # SUMMARY
    # ==========================================================================

    print("\n" + "=" * 70)
    print("SEED COMPLETE!")
    print("=" * 70)
    print(f"\nWorkflow: {WORKFLOW_NAME}")
    print(f"Workflow ID: {workflow_id}")
    print("\nNode Types: Account, Contact, SalesTrigger, Outreach, SalesContent")
    print("\nTaskSet Definitions:")
    print(f"  1. {trigger_flow_def.name} ({len(trigger_flow_def.tasks)} tasks) - Global flow")
    print(
        f"  2. {account_qual_def.name} ({len(account_qual_def.tasks)} tasks) - Account-scoped "
        "(uses CompoundDelta)"
    )
    print(
        f"  3. {contact_outreach_def.name} "
        f"({len(contact_outreach_def.tasks)} tasks) - Contact-scoped (uses CompoundDelta)"
    )
    print("\nCompoundDelta Demo:")
    print("  - Account Qualification: 6 granular tasks → 4 semantic tasks")
    print("  - Contact Outreach: 8 granular tasks → 3 semantic tasks")
    print("  - Bundled operations: create+link, draft+send+update")
    print("\nSample Data:")
    print("  - 3 Accounts (with ICP scores)")
    print("  - 3 Contacts (with buyer personas)")
    print("  - 3 Sales Triggers (linked to accounts)")
    print("  - 3 Sales Content pieces")
    print(f"\nAccess the tasks UI at: /workflows/{workflow_id}/tasks")

    # Close the database connection
    await close_database()


if __name__ == "__main__":
    asyncio.run(main())
