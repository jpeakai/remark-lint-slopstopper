# Legacy returns routing

Family detector: `flowchart`.

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
graph LR
  Customer[Customer] --> Portal[Returns portal]
  Portal --> Eligibility{Within 30 days?}
  Eligibility -->|Yes| Label[Issue return label]
  Eligibility -->|No| Review[Manual review]
  Label --> Warehouse[Warehouse inspection]
  Review --> Warehouse
  Warehouse --> Refund[Refund original payment]
  classDef interface fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef decision fill:#eacf5a,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef processing fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef outcome fill:#46ecd5,stroke:#737373,color:#0a0a0a,stroke-width:2px
  class Customer,Portal interface
  class Eligibility decision
  class Label,Review,Warehouse processing
  class Refund outcome
  linkStyle default stroke:#737373,stroke-width:2px
```
