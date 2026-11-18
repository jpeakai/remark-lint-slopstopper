// Mermaid's library-facing types, imported from its distribution in this one
// module. Mermaid publishes these only under dist/, so a dependency bump that
// moves or renames one fails to compile here, not across the package.

export type { Diagram } from "mermaid/dist/Diagram.js";

export type { DiagramDB, DiagramStyleClassDef } from "mermaid/dist/diagram-api/types.js";

export type { ArchitectureDB } from "mermaid/dist/diagrams/architecture/architectureDb.js";

export type { ClassDB } from "mermaid/dist/diagrams/class/classDb.js";

export type { ClassMember, ClassNode, ClassRelation } from "mermaid/dist/diagrams/class/classTypes.js";

export type { DomainName } from "mermaid/dist/diagrams/cynefin/types.js";

export type { ErDB } from "mermaid/dist/diagrams/er/erDb.js";

export type { Attribute as ErAttribute, Relationship as ErRelationship } from "mermaid/dist/diagrams/er/erTypes.js";

export type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";

export type { FlowEdge } from "mermaid/dist/diagrams/flowchart/types.js";

export type { GitGraphDB } from "mermaid/dist/diagrams/git/gitGraphTypes.js";

export type { IshikawaDB } from "mermaid/dist/diagrams/ishikawa/ishikawaDb.js";

export type { MindmapDB } from "mermaid/dist/diagrams/mindmap/mindmapDb.js";

export type { PacketDB } from "mermaid/dist/diagrams/packet/db.js";

export type { PieDB } from "mermaid/dist/diagrams/pie/pieTypes.js";

export type { RadarDB } from "mermaid/dist/diagrams/radar/types.js";

export type { ASTNode as RailroadNode, RailroadDB } from "mermaid/dist/diagrams/railroad/railroadTypes.js";

export type { RequirementDB } from "mermaid/dist/diagrams/requirement/requirementDb.js";

export type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";

export type { Actor as SequenceActor, Message as SequenceMessage } from "mermaid/dist/diagrams/sequence/types.js";

export type { StateDB } from "mermaid/dist/diagrams/state/stateDb.js";

export type { TreeMapDB } from "mermaid/dist/diagrams/treemap/db.js";

export type { TreemapNode } from "mermaid/dist/diagrams/treemap/types.js";

export type { TreeViewDB } from "mermaid/dist/diagrams/treeView/types.js";

export type { VennDB } from "mermaid/dist/diagrams/venn/vennTypes.js";

export type { Edge as LayoutEdge, LayoutData, Node as LayoutNode } from "mermaid/dist/rendering-util/types.js";
