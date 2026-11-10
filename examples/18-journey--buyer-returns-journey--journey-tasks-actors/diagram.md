# Buyer returns journey

Family detector: `journey`.

```mermaid
---
config: {"themeVariables":{"textColor":"#fff"}}
---
journey
  section Request
    Find order: 5: Buyer
    Explain issue: 3: Buyer
    Approve return: 4: Support
  section Fulfilment
    Print label: 4: Buyer
    Inspect parcel: 3: Warehouse
    Confirm refund: 5: Support
```
