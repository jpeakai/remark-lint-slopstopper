# Connector contrast

Each section names whether its connectors pass or fail 3:1.

## Passing: theme line colours

```mermaid
flowchart LR
  Cart --> Payment
  Payment -.-> Ledger
```

## Failing: pale link style

```mermaid
flowchart LR
  Cart --> Payment
  linkStyle 0 stroke:#dddddd
```

## Passing: invisible layout link

```mermaid
---
config:
  themeVariables:
    lineColor: '#ffffff'
---
flowchart LR
  Cart ~~~ Payment
```

## Failing: default lines inside a dark cluster

```mermaid
flowchart LR
  subgraph Checkout
    Cart --> Payment
  end
  style Checkout fill:#1e293b,color:#ffffff
  style Cart fill:#ffffff,color:#000000
  style Payment fill:#ffffff,color:#000000
```

## Passing: light lines inside a dark cluster

```mermaid
---
config:
  themeVariables:
    lineColor: '#cbd5e1'
---
flowchart LR
  subgraph Checkout
    Cart --> Payment
  end
  style Checkout fill:#1e293b,color:#ffffff
  style Cart fill:#ffffff,color:#000000
  style Payment fill:#ffffff,color:#000000
```

## Failing: pale sequence messages

```mermaid
---
config:
  themeVariables:
    signalColor: '#e2e8f0'
---
sequenceDiagram
  participant Cart
  participant Payment
  Cart->>Payment: authorise card
```
