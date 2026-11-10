# Diagram examples

Each numbered folder contains an original `diagram.md` and an editable `diagram-fixed.md`.
Names follow `{NN}-{diagram-type}--{example-name}--{demonstrated-aspect}`.
The documentation site groups the same folders by diagram type and shows each pair on its own page.

Originals deliberately exercise complexity, contrast, compatibility and style isolation.
The comparison files are reviewable examples, not a promise that every policy passes.
The site uses Mermaid 12.2.0; the package's analysis engine keeps its separately pinned version.

Use **jpai-essentials:mermaidjs-diagrams** from the **jpeakai/skills** plugin for repair and styling guidance.
The [repair prompt](fix-prompt.md) explains how to preserve diagram facts and verify changes.
See the [runner guide](scripts/README.md) to select a local copy of that skill.

| Diagram type | Example | Original | Comparison |
| --- | --- | --- | --- |
| flowchart | Shop architecture | [Before](01-flowchart--shop-architecture--overview-detail-splitting/diagram.md) | [After](01-flowchart--shop-architecture--overview-detail-splitting/diagram-fixed.md) |
| flowchart | Loan underwriting decisions | [Before](02-flowchart--loan-underwriting-decisions--decision-flow-splitting/diagram.md) | [After](02-flowchart--loan-underwriting-decisions--decision-flow-splitting/diagram-fixed.md) |
| flowchart | Unreadable label | [Before](03-flowchart--unreadable-label--text-against-node-fills/diagram.md) | [After](03-flowchart--unreadable-label--text-against-node-fills/diagram-fixed.md) |
| flowchart | Clean diagram after the failure | [Before](04-flowchart--clean-diagram-after-the-failure--styles-between-diagrams/diagram.md) | [After](04-flowchart--clean-diagram-after-the-failure--styles-between-diagrams/diagram-fixed.md) |
| flowchart | Legacy returns routing | [Before](05-flowchart--legacy-returns-routing--legacy-flowchart-theme-colours/diagram.md) | [After](05-flowchart--legacy-returns-routing--legacy-flowchart-theme-colours/diagram-fixed.md) |
| flowchart | Regional order routing | [Before](06-flowchart--regional-order-routing--elk-flowchart-theme-colours/diagram.md) | [After](06-flowchart--regional-order-routing--elk-flowchart-theme-colours/diagram-fixed.md) |
| sequenceDiagram | Checkout authorization sequence | [Before](07-sequenceDiagram--checkout-authorization-sequence--sequence-participants-messages/diagram.md) | [After](07-sequenceDiagram--checkout-authorization-sequence--sequence-participants-messages/diagram-fixed.md) |
| sequenceDiagram | Purchase delivery return and refund lifecycle | [Before](08-sequenceDiagram--purchase-delivery-return-and-refund-lifecycle--ordered-sequence-phases/diagram.md) | [After](08-sequenceDiagram--purchase-delivery-return-and-refund-lifecycle--ordered-sequence-phases/diagram-fixed.md) |
| erDiagram | Order storage relationships | [Before](09-erDiagram--order-storage-relationships--entity-labels-attribute-rows/diagram.md) | [After](09-erDiagram--order-storage-relationships--entity-labels-attribute-rows/diagram-fixed.md) |
| erDiagram | Checkout ledger storage detail | [Before](10-erDiagram--checkout-ledger-storage-detail--entity-rows-recoverable-detail/diagram.md) | [After](10-erDiagram--checkout-ledger-storage-detail--entity-rows-recoverable-detail/diagram-fixed.md) |
| classDiagram | Order domain classes | [Before](11-classDiagram--order-domain-classes--class-labels-member-rows/diagram.md) | [After](11-classDiagram--order-domain-classes--class-labels-member-rows/diagram-fixed.md) |
| classDiagram | Legacy inventory interfaces | [Before](12-classDiagram--legacy-inventory-interfaces--interface-labels/diagram.md) | [After](12-classDiagram--legacy-inventory-interfaces--interface-labels/diagram-fixed.md) |
| architecture | Checkout infrastructure | [Before](13-architecture--checkout-infrastructure--architecture-groups-services/diagram.md) | [After](13-architecture--checkout-infrastructure--architecture-groups-services/diagram-fixed.md) |
| block | Order worker stages | [Before](14-block--order-worker-stages--block-labels/diagram.md) | [After](14-block--order-worker-stages--block-labels/diagram-fixed.md) |
| C4Context | Checkout system context | [Before](15-C4Context--checkout-system-context--portable-system-context-view/diagram.md) | [After](15-C4Context--checkout-system-context--portable-system-context-view/diagram-fixed.md) |
| eventmodeling | Order placement event model | [Before](16-eventmodeling--order-placement-event-model--ui-command-event-read-model-cards/diagram.md) | [After](16-eventmodeling--order-placement-event-model--ui-command-event-read-model-cards/diagram-fixed.md) |
| gantt | Warehouse rollout schedule | [Before](17-gantt--warehouse-rollout-schedule--gantt-task-labels/diagram.md) | [After](17-gantt--warehouse-rollout-schedule--gantt-task-labels/diagram-fixed.md) |
| journey | Buyer returns journey | [Before](18-journey--buyer-returns-journey--journey-tasks-actors/diagram.md) | [After](18-journey--buyer-returns-journey--journey-tasks-actors/diagram-fixed.md) |
| kanban | Checkout release work | [Before](19-kanban--checkout-release-work--kanban-columns-cards/diagram.md) | [After](19-kanban--checkout-release-work--kanban-columns-cards/diagram-fixed.md) |
| mindmap | Fulfilment readiness checklist | [Before](20-mindmap--fulfilment-readiness-checklist--mindmap-branches/diagram.md) | [After](20-mindmap--fulfilment-readiness-checklist--mindmap-branches/diagram-fixed.md) |
| quadrantChart | Checkout improvement prioritisation | [Before](21-quadrantChart--checkout-improvement-prioritisation--quadrant-labels/diagram.md) | [After](21-quadrantChart--checkout-improvement-prioritisation--quadrant-labels/diagram-fixed.md) |
| radar | Fulfilment capability comparison | [Before](22-radar--fulfilment-capability-comparison--radar-axes-legend-labels/diagram.md) | [After](22-radar--fulfilment-capability-comparison--radar-axes-legend-labels/diagram-fixed.md) |
| requirementDiagram | Reservation safety requirements | [Before](23-requirementDiagram--reservation-safety-requirements--requirement-nodes/diagram.md) | [After](23-requirementDiagram--reservation-safety-requirements--requirement-nodes/diagram-fixed.md) |
| sankey | Order disposition volumes | [Before](24-sankey--order-disposition-volumes--flow-labels-volumes/diagram.md) | [After](24-sankey--order-disposition-volumes--flow-labels-volumes/diagram-fixed.md) |
| swimlane | Returns responsibility lanes | [Before](25-swimlane--returns-responsibility-lanes--swimlane-headers-tasks/diagram.md) | [After](25-swimlane--returns-responsibility-lanes--swimlane-headers-tasks/diagram-fixed.md) |
| timeline | Checkout migration milestones | [Before](26-timeline--checkout-migration-milestones--timeline-sections-events/diagram.md) | [After](26-timeline--checkout-migration-milestones--timeline-sections-events/diagram-fixed.md) |
| treemap | Monthly fulfilment costs | [Before](27-treemap--monthly-fulfilment-costs--nested-treemap-labels/diagram.md) | [After](27-treemap--monthly-fulfilment-costs--nested-treemap-labels/diagram-fixed.md) |
| treeView | Checkout repository ownership | [Before](28-treeView--checkout-repository-ownership--portable-ownership-hierarchy/diagram.md) | [After](28-treeView--checkout-repository-ownership--portable-ownership-hierarchy/diagram-fixed.md) |
| venn | Buyer channel overlap | [Before](29-venn--buyer-channel-overlap--set-intersection-labels/diagram.md) | [After](29-venn--buyer-channel-overlap--set-intersection-labels/diagram-fixed.md) |
| stateDiagram | Legacy payment lifecycle | [Before](30-stateDiagram--legacy-payment-lifecycle--state-diagram-labels/diagram.md) | [After](30-stateDiagram--legacy-payment-lifecycle--state-diagram-labels/diagram-fixed.md) |
| stateDiagram | Reservation lifecycle | [Before](31-stateDiagram--reservation-lifecycle--composite-state-surfaces/diagram.md) | [After](31-stateDiagram--reservation-lifecycle--composite-state-surfaces/diagram-fixed.md) |

The [grouped-sequence original](sequence-box-contrast.md) and [comparison](sequence-box-contrast-fixed.md) exercise participant backgrounds and message gaps.
Runnable remark configurations and `sample.md` demonstrate this package's public entry points.
