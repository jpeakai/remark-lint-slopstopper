# Order disposition volumes

Family detector: `sankey`.

```mermaid
---
config: {"themeVariables":{"textColor":"#fff","mainBkg":"#fff"}}
---
sankey-beta

Placed,Payment accepted,920
Placed,Payment declined,80
Payment accepted,Shipped,870
Payment accepted,Cancelled,50
Shipped,Delivered,830
Shipped,Returned,40
```
