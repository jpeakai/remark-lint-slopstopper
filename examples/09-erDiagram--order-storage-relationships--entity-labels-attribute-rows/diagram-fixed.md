# Order storage relationships

Family detector: `er`.

```mermaid
---
config:
  layout: dagre
  theme: base
  themeVariables:
    rowOdd: '#ffffff'
    rowEven: '#f7f6ff'
    primaryTextColor: '#0a0a0a'
    textColor: '#0a0a0a'
    lineColor: '#737373'
    edgeLabelBackground: '#ffffff'
---
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_LINE : contains
  PRODUCT ||--o{ ORDER_LINE : identifies
  ORDER ||--o| PAYMENT : settles
  CUSTOMER {
    string customer_id PK
    string email
  }
  ORDER {
    string order_id PK
    string customer_id FK
  }
  ORDER_LINE {
    string order_id FK
    string sku FK
    int quantity
  }
  PRODUCT {
    string sku PK
  }
  PAYMENT {
    string payment_id PK
    string order_id FK
  }
  classDef customer fill:#eef9ff,color:#0a0a0a,stroke:#266d97,stroke-width:2px
  classDef orders fill:#f7f6ff,color:#0a0a0a,stroke:#675b99,stroke-width:2px
  classDef product fill:#e1fcf8,color:#0a0a0a,stroke:#00776e,stroke-width:2px
  classDef payment fill:#fcf7e5,color:#0a0a0a,stroke:#726819,stroke-width:2px
  class CUSTOMER customer
  class ORDER,ORDER_LINE orders
  class PRODUCT product
  class PAYMENT payment
```
