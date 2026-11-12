# Material for MkDocs viewer

These diagrams are measured with the default indigo palette in its light and slate modes.
Each section names whether it passes or fails there.

## Passing: a flowchart with a cluster

```mermaid
flowchart LR
  subgraph Checkout
    Cart --> Payment
  end
  Payment -->|records| Ledger
```

## Passing: sequence messages and notes

```mermaid
sequenceDiagram
  participant Cart
  participant Payment
  Cart->>Payment: authorise card
  Note over Payment: holds funds
```

## Failing: sequence frame labels in the accent colour

```mermaid
sequenceDiagram
  participant Cart
  participant Payment
  loop Every retry
    Cart->>Payment: authorise card
  end
```

## Failing: a light pie on the dark palette

```mermaid
pie
  title Orders
  "Kept": 3
  "Returned": 1
```
