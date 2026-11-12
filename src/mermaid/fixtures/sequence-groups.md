# Sequence participant groups

Each diagram pins light text so its backdrop decides the outcome.

## Opaque group

Messages between members of one dark group sit on the group fill.

```mermaid
---
config:
  themeVariables:
    textColor: '#ffffff'
    signalTextColor: '#ffffff'
    actorBkg: '#ffffff'
    actorTextColor: '#000000'
---
sequenceDiagram
  box rgb(15,23,42) Checkout
  participant Cart
  participant Payment
  participant Ledger
  end
  Cart->>Payment: authorise card
  Payment->>Ledger: record hold
```

## Transparent group

A transparent group shows the page, so its labels need page contrast.

```mermaid
---
config:
  themeVariables:
    signalTextColor: '#64748b'
    actorBkg: '#ffffff'
    actorTextColor: '#000000'
---
sequenceDiagram
  box transparent Checkout
  participant Cart
  participant Payment
  end
  Cart->>Payment: authorise card
```

## Nested rectangles

Translucent rects composite over the group fill in statement order.

```mermaid
---
config:
  themeVariables:
    textColor: '#ffffff'
    signalTextColor: '#ffffff'
    actorBkg: '#ffffff'
    actorTextColor: '#000000'
---
sequenceDiagram
  box rgb(15,23,42) Checkout
  participant Cart
  participant Payment
  end
  rect rgba(30,64,175,0.5)
    Cart->>Payment: authorise card
    rect rgba(0,0,0,0.4)
      Payment->>Cart: approved
    end
  end
```

## Self message on an edge participant

A self message label is centred on its lifeline, so on the last member it reaches the page.

```mermaid
---
config:
  themeVariables:
    textColor: '#ffffff'
    signalTextColor: '#ffffff'
    actorBkg: '#ffffff'
    actorTextColor: '#000000'
---
sequenceDiagram
  box rgb(15,23,42) Checkout
  participant Cart
  participant Payment
  end
  Cart->>Payment: authorise card
  Payment->>Payment: recompute the order totals for every line item
```
