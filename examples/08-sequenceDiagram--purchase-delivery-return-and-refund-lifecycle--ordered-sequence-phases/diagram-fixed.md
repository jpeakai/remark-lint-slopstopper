# Purchase delivery return and refund lifecycle

The phases retain the complete interaction order.
Participant colours identify responsibilities across views.

## Basket validation

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
    participant Storefront
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(229,252,247) Stock management
    participant Inventory
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Basket validation
  Buyer->>Storefront: Open basket
  Storefront-->>Buyer: Basket items and totals
  Storefront->>Orders: Validate requested products
  Orders-->>Storefront: Validated basket
  Storefront->>Orders: Calculate tax and delivery
  Orders-->>Storefront: Quoted total
  Orders->>Inventory: Read stock positions
  Inventory-->>Orders: Regional stock positions
  Storefront->>Buyer: Request delivery address
  Buyer-->>Storefront: Confirmed delivery address
  Storefront->>Orders: Validate promotion code
  Orders-->>Storefront: Promotion eligibility
  Buyer->>Storefront: Accept quoted basket
  Storefront-->>Buyer: Basket acceptance recorded

  end
```

## Inventory reservation

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
    participant Storefront
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(229,252,247) Stock management
    participant Inventory
  end
  box rgb(252,247,229) Physical fulfilment
    participant Warehouse
  end
  box rgb(255,245,250) Audit records
    participant Ledger
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Inventory reservation
  Storefront->>Orders: Submit checkout intent
  Orders-->>Storefront: Checkout identifier
  Orders->>Inventory: Create expiring stock holds
  Inventory-->>Orders: Reservation tokens
  Inventory->>Warehouse: Check picking capacity
  Warehouse-->>Inventory: Capacity slot
  Orders->>Ledger: Record reservation intent
  Ledger-->>Orders: Audit receipt
  Orders->>Inventory: Verify reserved quantities
  Inventory-->>Orders: Quantity verification
  Orders->>Storefront: Publish reserved basket
  Storefront-->>Orders: Reserved basket acknowledged
  Storefront->>Buyer: Present reserved total
  Buyer-->>Storefront: Payment choice

  end
```

## Payment authorization

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
    participant Storefront
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(229,252,247) Stock management
    participant Inventory
  end
  box rgb(252,247,229) Payment processing
    participant Payments
  end
  box rgb(255,245,250) Audit records
    participant Ledger
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Payment authorization
  Storefront->>Payments: Tokenize selected payment
  Payments-->>Storefront: Payment token
  Orders->>Payments: Authorize confirmed amount
  Payments-->>Orders: Authorization reference
  Payments->>Ledger: Record provider response
  Ledger-->>Payments: Authorization audit receipt
  Orders->>Payments: Confirm authorization status
  Payments-->>Orders: Authorized status
  Orders->>Inventory: Attach authorization reference
  Inventory-->>Orders: Reservation linkage
  Orders->>Ledger: Record order confirmation
  Ledger-->>Orders: Confirmation audit receipt
  Storefront->>Buyer: Display confirmed order
  Buyer-->>Storefront: Confirmation acknowledged

  end
```

## Warehouse fulfilment

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(229,252,247) Stock management
    participant Inventory
  end
  box rgb(252,247,229) Physical fulfilment
    participant Warehouse
  end
  box rgb(255,245,250) Audit records
    participant Ledger
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Warehouse fulfilment
  Orders->>Warehouse: Release picking request
  Warehouse-->>Orders: Picking batch identifier
  Warehouse->>Inventory: Read reserved locations
  Inventory-->>Warehouse: Picking locations
  Warehouse->>Inventory: Confirm picked quantities
  Inventory-->>Warehouse: Pick reconciliation
  Warehouse->>Orders: Report substitution check
  Orders-->>Warehouse: Substitution decision
  Warehouse->>Inventory: Consume confirmed reservation
  Inventory-->>Warehouse: Stock movement receipt
  Warehouse->>Ledger: Record packing evidence
  Ledger-->>Warehouse: Packing audit receipt
  Warehouse->>Orders: Report packed parcels
  Orders-->>Warehouse: Shipment request

  end
```

## Carrier dispatch

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(252,247,229) Payment processing
    participant Payments
  end
  box rgb(252,247,229) Physical fulfilment
    participant Warehouse
    participant Carrier
  end
  box rgb(255,245,250) Audit records
    participant Ledger
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Carrier dispatch
  Orders->>Carrier: Quote selected service
  Carrier-->>Orders: Carrier quote
  Orders->>Carrier: Book packed parcels
  Carrier-->>Orders: Tracking identifiers
  Carrier->>Warehouse: Issue printable labels
  Warehouse-->>Carrier: Label application confirmation
  Warehouse->>Carrier: Confirm collection readiness
  Carrier-->>Warehouse: Collection booking
  Carrier->>Orders: Report parcel collection
  Orders-->>Carrier: Collection acknowledged
  Orders->>Payments: Capture authorized amount
  Payments-->>Orders: Capture reference
  Orders->>Ledger: Record dispatch and capture
  Ledger-->>Orders: Dispatch audit receipt

  end
```

## Delivery confirmation

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
    participant Storefront
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(252,247,229) Physical fulfilment
    participant Carrier
  end
  box rgb(255,245,250) Audit records
    participant Ledger
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Delivery confirmation
  Orders->>Carrier: Read tracking progress
  Carrier-->>Orders: In-transit scan
  Storefront->>Orders: Read buyer order status
  Orders-->>Storefront: Tracking summary
  Buyer->>Storefront: Open shipment tracker
  Storefront-->>Buyer: Shipment tracker displayed
  Carrier->>Orders: Report delivery attempt
  Orders-->>Carrier: Attempt acknowledged
  Carrier->>Orders: Report delivered parcel
  Orders-->>Carrier: Delivery acknowledged
  Orders->>Ledger: Record delivery evidence
  Ledger-->>Orders: Delivery audit receipt
  Storefront->>Buyer: Present delivery confirmation
  Buyer-->>Storefront: Delivery confirmation acknowledged

  end
```

## Return inspection

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(229,252,247) Stock management
    participant Inventory
  end
  box rgb(252,247,229) Physical fulfilment
    participant Warehouse
    participant Carrier
  end
  box rgb(255,245,235) Return support
    participant Support
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Return inspection
  Buyer->>Support: Request damaged-item return
  Support-->>Buyer: Return case identifier
  Support->>Orders: Check return eligibility
  Orders-->>Support: Eligible order lines
  Support->>Carrier: Book return collection
  Carrier-->>Support: Return tracking identifier
  Carrier->>Warehouse: Deliver returned parcel
  Warehouse-->>Carrier: Return receipt
  Warehouse->>Orders: Report item inspection
  Orders-->>Warehouse: Inspection decision
  Warehouse->>Inventory: Restock accepted quantities
  Inventory-->>Warehouse: Restock movement receipt
  Support->>Buyer: Confirm accepted return
  Buyer-->>Support: Return acceptance acknowledged

  end
```

## Refund reconciliation

```mermaid
---
config:
  theme: base
  look: classic
  sequence:
    wrap: true
  themeVariables:
    actorTextColor: '#0a0a0a'
    actorBkg: '#ffffff'
    actorBorder: '#737373'
    actorLineColor: '#737373'
    signalColor: '#737373'
    signalTextColor: '#0a0a0a'
    labelBoxBkgColor: '#ffffff'
    labelBoxBorderColor: '#737373'
    labelTextColor: '#0a0a0a'
    loopTextColor: '#0a0a0a'
    noteTextColor: '#0a0a0a'
    noteBkgColor: '#eacf5a'
    noteBorderColor: '#737373'
    textColor: '#0a0a0a'
    background: '#ffffff'
---
sequenceDiagram
  box rgb(237,249,255) Buyer interface
    participant Buyer
    participant Storefront
  end
  box rgb(247,246,255) Order coordination
    participant Orders
  end
  box rgb(252,247,229) Payment processing
    participant Payments
  end
  box rgb(255,245,250) Audit records
    participant Ledger
  end
  box rgb(255,245,235) Return support
    participant Support
  end
  rect rgb(255,255,255)
  Note over Buyer,Orders: Refund reconciliation
  Support->>Orders: Approve inspected refund
  Orders-->>Support: Refund request identifier
  Orders->>Payments: Refund original captured payment
  Payments-->>Orders: Provider refund reference
  Payments->>Ledger: Record refund provider response
  Ledger-->>Payments: Refund audit receipt
  Orders->>Payments: Verify refund settlement
  Payments-->>Orders: Settled refund status
  Orders->>Ledger: Close refund reconciliation
  Ledger-->>Orders: Reconciliation receipt
  Storefront->>Buyer: Present refund confirmation
  Buyer-->>Storefront: Refund confirmation acknowledged
  Support->>Orders: Close return case
  Orders-->>Support: Closed return status
  end
```
