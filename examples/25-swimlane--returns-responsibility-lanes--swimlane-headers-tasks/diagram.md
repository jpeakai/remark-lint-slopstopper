# Returns responsibility lanes

Family detector: `swimlane`.

```mermaid
---
config: {"themeVariables":{"primaryTextColor":"#fff","primaryColor":"#fff","mainBkg":"#fff"}}
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
```
