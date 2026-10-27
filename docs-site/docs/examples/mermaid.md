# Mermaid findings

Mermaid policies check diagram code nodes in the host tree.
Their findings provide guidance while leaving diagram source unchanged.
The following sources are shown as text so failing examples remain visible without rendering.

## Correct unreadable text contrast

`contrast-text-below-aa` requires at least 4.5:1 text contrast on the surfaces it audits.

=== "Failing source"

    ```text
    flowchart LR
      A[Queue]:::queue
      classDef queue fill:#ffffff,color:#ffffff,stroke:#334155
    ```

=== "Manual correction"

    ```text
    flowchart LR
      A[Queue]:::queue
      classDef queue fill:#ffffff,color:#1e293b,stroke:#334155
    ```

The first node has white text on white fill.
The correction keeps the node and changes its text colour.
Real documents need a `mermaid` fence rather than a `text` fence.

Unsupported styling can make a diagram unauditable.
Such input reports an error instead of silently passing.
See [Mermaid text contrast](../RULES.md#mermaid-text-contrast).

## Reduce a diagram with excessive fan-out

With the `low-density` Complexity Preset, this graph scores 28 against an acceptable score of 25:

```text
flowchart LR
  Root --> A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R
```

Its 19 nodes and 18 edges express one flat relationship.
A list can express that relationship without a diagram.

Graphs with meaningful boundaries can receive a verified Split Plan containing overview and detail sources.
The plugin checks recoverability, emitted source and declared information loss before offering a plan.
Sequence diagrams are not split because a graph would discard message order.

See [Mermaid visual complexity](../RULES.md#mermaid-visual-complexity) for the score formula and [split planning](../src/mermaid/splitting/README.md) for the contract.
