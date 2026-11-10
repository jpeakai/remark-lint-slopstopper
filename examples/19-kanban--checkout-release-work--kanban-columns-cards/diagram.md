# Checkout release work

Family detector: `kanban`.

```mermaid
---
config: {"themeVariables":{"textColor":"#fff","background":"#fff"}}
---
kanban
  backlog[Backlog]
    tracing[Trace failed payments]
    export[Export refund evidence]
  progress[In progress]
    retry[Bound authorization retries]
    stock[Reconcile stock reservations]
  review[Review]
    alert[Review payment alerts]
  done[Done]
    receipt[Send order receipts]
```
