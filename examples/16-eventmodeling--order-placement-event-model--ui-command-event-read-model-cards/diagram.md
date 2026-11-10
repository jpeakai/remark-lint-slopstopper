# Order placement event model

Family detector: `eventmodeling`.

```mermaid
---
config: {"themeVariables":{"emUiFill":"#fff","textColor":"#fff"}}
---
eventmodeling
  tf 01 ui Basket
  tf 02 cmd PlaceOrder
  tf 03 evt OrderPlaced
  tf 04 rmo OrderSummary
  tf 05 ui Confirmation ->> 04
  tf 06 cmd ReserveStock ->> 03
  tf 07 evt StockReserved
```
