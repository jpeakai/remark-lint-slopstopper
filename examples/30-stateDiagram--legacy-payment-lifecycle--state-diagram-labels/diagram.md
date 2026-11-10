# Legacy payment lifecycle

Family detector: `stateDiagram`.

```mermaid
---
config: {"themeVariables":{"primaryTextColor":"#fff","primaryColor":"#fff","mainBkg":"#fff"}}
---
stateDiagram
  [*] --> Created
  Created --> Authorized : bank approves
  Created --> Declined : bank rejects
  Authorized --> Captured : fulfilment starts
  Authorized --> Voided : customer cancels
  Captured --> Refunded : return accepted
  Declined --> [*]
  Voided --> [*]
  Refunded --> [*]
```
