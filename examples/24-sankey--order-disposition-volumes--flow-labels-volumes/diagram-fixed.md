# Order disposition volumes

Family detector: `sankey`.

Volumes appear on directed edges because Sankey bands use fixed blending that fails dark-canvas contrast.
Edge widths do not encode volume in this view.

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
flowchart LR
    Placed[Placed]:::placed -->|920| Accepted[Payment accepted]:::progress
    Placed -->|80| Declined[Payment declined]:::exception
    Accepted -->|870| Shipped[Shipped]:::progress
    Accepted -->|50| Cancelled[Cancelled]:::exception
    Shipped -->|830| Delivered[Delivered]:::progress
    Shipped -->|40| Returned[Returned]:::exception
    classDef placed fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
    classDef progress fill:#8ce89c,stroke:#737373,color:#0a0a0a,stroke-width:2px
    classDef exception fill:#ffbac2,stroke:#737373,color:#0a0a0a,stroke-width:2px
    linkStyle default stroke:#737373,stroke-width:2px
```
