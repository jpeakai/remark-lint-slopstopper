# Checkout migration milestones

Family detector: `timeline`.

The timeline is represented as a flowchart because native timeline arrowheads fail dark-theme contrast.
Period arrows show chronology; each period branches to its events in source order.

```mermaid
---
config:
  layout: dagre
  look: classic
  theme: base
  themeVariables:
    textColor: '#0a0a0a'
    primaryTextColor: '#0a0a0a'
    edgeLabelBackground: '#ffffff'
    lineColor: '#737373'
---
flowchart TB
  subgraph Foundation[Foundation]
    Jan[2026-01]:::foundation
    Contract[Publish payment contract]:::foundation
    Tracing[Add reservation tracing]:::foundation
    Feb[2026-02]:::foundation
    Authorization[Deploy idempotent authorization]:::foundation
    Jan -->|next period| Feb
    Jan --> Contract --> Tracing
    Feb --> Authorization
  end
  subgraph Expansion[Expansion]
    Mar[2026-03]:::expansion
    Pilot[Pilot regional fulfilment]:::expansion
    Apr[2026-04]:::expansion
    Reconciliation[Enable refund reconciliation]:::expansion
    Settlement[Retire batch settlement]:::expansion
    Mar -->|next period| Apr
    Mar --> Pilot
    Apr --> Reconciliation --> Settlement
  end
  Feb -->|next period| Mar
  classDef foundation fill:#96d9ff,stroke:#475569,color:#0a0a0a,stroke-width:2px
  classDef expansion fill:#cbc9ff,stroke:#675b99,color:#0a0a0a,stroke-width:2px
  style Foundation fill:#eef9ff,stroke:#475569,color:#0a0a0a,stroke-width:2px
  style Expansion fill:#f7f6ff,stroke:#675b99,color:#0a0a0a,stroke-width:2px
  linkStyle default stroke:#737373,stroke-width:2px
```
