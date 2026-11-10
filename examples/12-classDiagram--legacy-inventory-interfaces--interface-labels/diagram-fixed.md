# Legacy inventory interfaces

Family detector: `class`.

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
classDiagram
  class StockReader {
    <<interface>>
    +available(sku) int
  }
  class WarehouseStock {
    +available(sku) int
    +reserve(sku, quantity)
  }
  class Reservation {
    +string reservationId
    +release()
  }
  StockReader <|.. WarehouseStock
  WarehouseStock --> Reservation : creates
  classDef contract fill:#96d9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef implementation fill:#cbc9ff,stroke:#737373,color:#0a0a0a,stroke-width:2px
  classDef record fill:#46ecd5,stroke:#737373,color:#0a0a0a,stroke-width:2px
  cssClass "StockReader" contract
  cssClass "WarehouseStock" implementation
  cssClass "Reservation" record
```
