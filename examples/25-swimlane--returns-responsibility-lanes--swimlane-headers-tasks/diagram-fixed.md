# Returns responsibility lanes

Family detector: `swimlane`.

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryTextColor: '#0a0a0a'
    textColor: '#0a0a0a'
    titleColor: '#0a0a0a'
    lineColor: '#737373'
    edgeLabelBackground: '#ffffff'
    primaryColor: '#cbc9ff'
    mainBkg: '#cbc9ff'
    clusterBkg: '#f7f6ff'
    clusterBorder: '#675b99'
---
swimlane-beta LR
  subgraph Customer
    Request[Request return] --> Pack[Pack parcel]
  end
  subgraph Support
    Approve[Approve eligibility]
    Notify[Notify refund]
  end
  subgraph Warehouse
    Inspect[Inspect parcel] --> Restock[Restock items]
  end
  Request --> Approve
  Approve --> Pack
  Pack --> Inspect
  Restock --> Notify
  classDef customer fill:#96d9ff,color:#0a0a0a,stroke:#737373,stroke-width:2px
  classDef support fill:#eacf5a,color:#0a0a0a,stroke:#737373,stroke-width:2px
  classDef warehouse fill:#8ce89c,color:#0a0a0a,stroke:#737373,stroke-width:2px
  class Request,Pack customer
  class Approve,Notify support
  class Inspect,Restock warehouse
```
