# Checkout authorization sequence

Family detector: `sequence`.

```mermaid
---
config: {"themeVariables":{"actorTextColor":"#fff","actorBkg":"#fff"}}
---
sequenceDiagram
  participant Buyer
  participant Checkout
  participant Stock
  participant Payment
  Buyer->>Checkout: Confirm basket
  Checkout->>Stock: Reserve items
  Stock-->>Checkout: Reservation token
  Checkout->>Payment: Authorize total
  alt Authorization accepted
    Payment-->>Checkout: Authorization reference
    Checkout-->>Buyer: Order confirmation
  else Authorization declined
    Payment-->>Checkout: Decline reason
    Checkout->>Stock: Release reservation
    Checkout-->>Buyer: Payment retry
  end
```
