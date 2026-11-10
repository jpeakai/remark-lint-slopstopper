# Order domain classes

Family detector: `classDiagram`.

```mermaid
---
config: {"themeVariables":{"primaryTextColor":"#fff","primaryColor":"#fff","mainBkg":"#fff"},"class":{"defaultRenderer":"dagre-wrapper"}}
---
classDiagram
  class Order {
    +string orderId
    +decimal total
    +confirm()
  }
  class OrderLine {
    +string sku
    +int quantity
  }
  class Payment {
    +string reference
    +authorize()
  }
  class Customer {
    +string email
  }
  Customer "1" --> "0..*" Order : places
  Order "1" *-- "1..*" OrderLine : contains
  Order "1" --> "1" Payment : charges
```
